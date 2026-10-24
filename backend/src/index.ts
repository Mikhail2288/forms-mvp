import express, { Request, Response } from 'express';
import { createClient, Client } from '@libsql/client';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());

let db: Client;

async function initDatabase() {
    db = createClient({
        url: 'file:./forms_mvp.db',
    });

    await db.execute(`
        CREATE TABLE IF NOT EXISTS forms (
                                             id INTEGER PRIMARY KEY AUTOINCREMENT,
                                             uuid TEXT UNIQUE,
                                             title TEXT,
                                             status TEXT DEFAULT 'draft'
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS form_fields (
                                                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                   form_id INTEGER,
                                                   field_uuid TEXT UNIQUE,
                                                   type TEXT,
                                                   label TEXT,
                                                   is_required INTEGER,
                                                   options_json TEXT,
                                                   sort_order INTEGER
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS responses (
                                                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                 form_id INTEGER,
                                                 session_id TEXT,
                                                 submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS response_values (
                                                       id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                       response_id INTEGER,
                                                       field_uuid TEXT,
                                                       value TEXT
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS form_analytics (
                                                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                      form_id INTEGER,
                                                      session_id TEXT,
                                                      field_uuid TEXT,
                                                      event_type TEXT,
                                                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('✅ Database initialized');
}

// --- СХЕМЫ ВАЛИДАЦИИ ---
const fieldSchema = z.object({
    field_uuid: z.string().uuid().optional(),
    type: z.enum(['text', 'checkbox', 'select']),
    label: z.string().min(1),
    is_required: z.boolean().default(false),
    options: z.array(z.string()).optional(),
});

const createFormSchema = z.object({
    title: z.string().min(1),
    fields: z.array(fieldSchema),
});

// --- РОУТЫ МЕНЕДЖЕРА ---
app.post('/api/manager/forms', async (req: Request, res: Response) => {
    try {
        const data = createFormSchema.parse(req.body);
        const formUuid = randomUUID();

        const formResult = await db.execute({
            sql: 'INSERT INTO forms (uuid, title) VALUES (?, ?)',
            args: [formUuid, data.title],
        });

        const newFormId = Number(formResult.lastInsertRowid);

        const tx = await db.transaction('write');
        try {
            for (let index = 0; index < data.fields.length; index++) {
                const field = data.fields[index];
                const fieldUuid = field.field_uuid || randomUUID();

                await tx.execute({
                    sql: 'INSERT INTO form_fields (form_id, field_uuid, type, label, is_required, options_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    args: [
                        newFormId,
                        fieldUuid,
                        field.type,
                        field.label,
                        field.is_required ? 1 : 0,
                        field.options ? JSON.stringify(field.options) : null,
                        index,
                    ],
                });
            }
            await tx.commit();
        } catch (error) {
            await tx.rollback();
            throw error;
        }

        res.status(201).json({ id: newFormId, uuid: formUuid });
    } catch (error) {
        console.error('Error creating form:', error);
        res.status(400).json({ error: 'Invalid data', details: error });
    }
});

app.post('/api/manager/forms/:id/publish', async (req: Request, res: Response) => {
    const publicUuid = randomUUID();
    await db.execute({
        sql: 'UPDATE forms SET uuid = ?, status = ? WHERE id = ?',
        args: [publicUuid, 'published', req.params.id],
    });
    res.json({ publicUrl: `/form/${publicUuid}` });
});

app.get('/api/manager/forms', async (req: Request, res: Response) => {
    try {
        const forms = await db.execute('SELECT id, uuid, title, status FROM forms ORDER BY id DESC');
        res.json(forms.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch forms' });
    }
});

// --- РОУТЫ СТУДЕНТА ---
app.get('/api/public/latest-form', async (req: Request, res: Response) => {
    try {
        const forms = await db.execute(`
      SELECT id, uuid, title FROM forms 
      WHERE status = 'published' 
      ORDER BY id DESC LIMIT 1
    `);
        if (forms.rows.length === 0) {
            return res.status(404).json({ error: 'No published forms found' });
        }
        res.json(forms.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch latest form' });
    }
});

app.get('/api/public/forms/:uuid', async (req: Request, res: Response) => {
    try {
        const formResult = await db.execute({
            sql: 'SELECT id, uuid, title, status FROM forms WHERE uuid = ? AND status = ?',
            args: [req.params.uuid, 'published'],
        });

        if (formResult.rows.length === 0) {
            return res.status(404).json({ error: 'Form not found or not published' });
        }

        const form = formResult.rows[0];
        const fieldsResult = await db.execute({
            sql: 'SELECT * FROM form_fields WHERE form_id = ? ORDER BY sort_order',
            args: [form.id],
        });

        const parsedFields = fieldsResult.rows.map((f: any) => ({
            field_uuid: f.field_uuid,
            type: f.type,
            label: f.label,
            is_required: !!f.is_required,
            options: f.options_json ? JSON.parse(f.options_json) : [],
        }));

        res.json({ id: form.id, title: form.title, fields: parsedFields });
    } catch (error) {
        console.error('Error fetching form:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/public/forms/:uuid/submit', async (req: Request, res: Response) => {
    const { sessionId, answers } = req.body;

    try {
        const formResult = await db.execute({
            sql: 'SELECT id FROM forms WHERE uuid = ?',
            args: [req.params.uuid],
        });

        if (formResult.rows.length === 0) {
            return res.status(404).json({ error: 'Form not found' });
        }

        const formId = Number(formResult.rows[0].id);
        const tx = await db.transaction('write');

        try {
            const responseResult = await tx.execute({
                sql: 'INSERT INTO responses (form_id, session_id) VALUES (?, ?)',
                args: [formId, sessionId],
            });

            const responseId = Number(responseResult.lastInsertRowid);
            const answerEntries = Object.entries(answers);

            if (answerEntries.length > 0) {
                const values = answerEntries.map(() => '(?, ?, ?)').join(', ');
                const args = answerEntries.flatMap(([fieldUuid, value]) => [
                    responseId,
                    fieldUuid,
                    String(value),
                ]);

                await tx.execute({
                    sql: `INSERT INTO response_values (response_id, field_uuid, value) VALUES ${values}`,
                    args,
                });
            }

            await tx.execute({
                sql: 'INSERT INTO form_analytics (form_id, session_id, event_type) VALUES (?, ?, ?)',
                args: [formId, sessionId, 'submit'],
            });

            await tx.commit();
        } catch (error) {
            await tx.rollback();
            throw error;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Submit error:', error);
        res.status(500).json({ error: 'Failed to submit form' });
    }
});

// --- АНАЛИТИКА (БЕЗОПАСНАЯ ВЕРСИЯ БЕЗ ДУБЛИКАТОВ) ---
const analyticsBuffer: Array<{
    form_id: number;
    session_id: string;
    field_uuid: string | null;
    event_type: string;
}> = [];

const BUFFER_SIZE = 100;
const FLUSH_INTERVAL = 5000;

async function flushAnalyticsBuffer() {
    if (analyticsBuffer.length === 0) return; // Просто выходим без лога

    console.log(`Flushing analytics buffer, items: ${analyticsBuffer.length}`);

    const batch = analyticsBuffer.splice(0, BUFFER_SIZE);

    try {
        const values = batch.map(() => '(?, ?, ?, ?)').join(', ');
        const args = batch.flatMap(item => [
            Number(item.form_id),
            String(item.session_id),
            item.field_uuid !== undefined && item.field_uuid !== null ? String(item.field_uuid) : null,
            String(item.event_type),
        ]);

        await db.execute({
            sql: `INSERT INTO form_analytics (form_id, session_id, field_uuid, event_type) VALUES ${values}`,
            args,
        });

        console.log(`Analytics flushed successfully (${batch.length} items)`);
    } catch (error) {
        console.error('Error flushing analytics buffer:', error);
    }
}

setInterval(flushAnalyticsBuffer, FLUSH_INTERVAL);

app.post('/api/public/analytics', async (req: Request, res: Response) => {
    const { formUuid, sessionId, fieldUuid, eventType } = req.body;

    try {
        const formResult = await db.execute({
            sql: 'SELECT id FROM forms WHERE uuid = ?',
            args: [String(formUuid)],
        });

        if (formResult.rows.length === 0) {
            return res.status(404).json({ error: 'Form not found' });
        }

        const formId = Number(formResult.rows[0].id);

        analyticsBuffer.push({
            form_id: formId,
            session_id: String(sessionId),
            field_uuid: fieldUuid !== undefined && fieldUuid !== null ? String(fieldUuid) : null,
            event_type: String(eventType),
        });

        // 🔥 Если это abandon - сбрасываем буфер НЕМЕДЛЕННО
        if (eventType === 'abandon') {
            console.log('Abandon detected! Flushing buffer immediately...');
            await flushAnalyticsBuffer();
        }
        else if (analyticsBuffer.length >= BUFFER_SIZE) {
            await flushAnalyticsBuffer();
        }

        res.status(204).send();
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Analytics failed' });
    }
});

// ЗАВЕРШЕНИЕ
process.on('SIGTERM', async () => {
    console.log('\n🛑 Получен сигнал SIGTERM. Завершение работы...');
    await flushAnalyticsBuffer();
    if (db) {
        await db.close();
        console.log('✅ База данных закрыта.');
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Получен сигнал SIGINT (Ctrl+C). Завершение работы...');
    await flushAnalyticsBuffer();
    if (db) {
        await db.close();
        console.log('✅ База данных закрыта.');
    }
    process.exit(0);
});

// --- ЗАПУСК ---
async function startServer() {
    try {
        await initDatabase();

        const PORT = Number(process.env.PORT) || 3000;
        const frontendDistPath = path.join(__dirname, '../../frontend/dist');

        app.use(express.static(frontendDistPath));

        app.get('*', (req, res) => {
            if (req.path.startsWith('/api/')) {
                return res.status(404).json({ error: 'API endpoint not found' });
            }
            res.sendFile(path.join(frontendDistPath, 'index.html'));
        });

        app.listen(PORT, () => {
            console.log(`\nService is running on http://localhost:${PORT}`);
            console.log(`Admin panel: http://localhost:${PORT}/admin\n`);
        });
    } catch (error) {
        console.error('Критическая ошибка при запуске сервера:', error);
        process.exit(1);
    }
}

startServer().catch(console.error);