import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { ZodError } from 'zod';
import * as z from 'zod';

// Импортируем схемы валидации и типы из отдельного файла для чистоты кода
import {
    createFormSchema,
    uuidSchema,
    dropoffSchema,
    type FormListItem,
    type FormDetail,
    type FormField,
    type ResponseItem
} from './schema.js';
import { db, initDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// парсинг входящих JSON-запросов.
app.use(express.json());


// api роуты
// Создание новой формы
app.post('/api/forms', async (req: Request, res: Response) => {
    try {
        // Zod проверяет, что пришли валидные title и массив fields
        const validatedData = createFormSchema.parse(req.body);
        const formId = uuidv4();

        // Используем транзакцию: если запись в form_fields упадет с ошибкой, запись в forms тоже отменится
        await db.execute('BEGIN');

        await db.execute({
            sql: 'INSERT INTO forms (id, title) VALUES (?, ?)',
            args: [formId, validatedData.title],
        });

        for (let i = 0; i < validatedData.fields.length; i++) {
            const field = validatedData.fields[i];
            const fieldId = uuidv4();
            await db.execute({
                sql: `INSERT INTO form_fields (id, form_id, type, label, required, options, position)
                      VALUES (?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    fieldId,
                    formId,
                    field.type,
                    field.label,
                    field.required ? 1 : 0,
                    field.options ? JSON.stringify(field.options) : null,
                    field.position,
                ],
            });
        }

        await db.execute('COMMIT');
        res.status(201).json({ id: formId, message: 'Form created successfully' });
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({ error: 'Invalid input data', details: error.issues });
        }
        console.error('Error creating form:', error);
        res.status(500).json({ error: 'Failed to create form' });
    }
});

// Получение списка всех форм (для таблицы в админке)
app.get('/api/forms', async (_req: Request, res: Response) => {
    try {
        const result = await db.execute({
            sql: 'SELECT id, title, created_at FROM forms ORDER BY created_at DESC',
            args: [],
        });

        const forms: FormListItem[] = result.rows.map((row) => ({
            id: row.id as string,
            title: row.title as string,
            created_at: row.created_at as string,
        }));

        res.status(200).json(forms);
    } catch (error) {
        console.error('Error fetching forms:', error);
        res.status(500).json({ error: 'Failed to fetch forms' });
    }
});

// Получение полной схемы формы по UUID (для рендера публичной страницы)
app.get('/api/forms/:uuid', async (req: Request, res: Response) => {
    try {
        // Если UUID невалидный, Zod выбросит ошибку здесь, не доходя до БД
        const validatedUuid = uuidSchema.parse(req.params.uuid);

        const formResult = await db.execute({
            sql: 'SELECT id, title, created_at FROM forms WHERE id = ?',
            args: [validatedUuid],
        });

        if (formResult.rows.length === 0) {
            return res.status(404).json({ error: 'Form not found' });
        }

        const formRow = formResult.rows[0];

        // Загружаем поля, отсортированные по позиции, чтобы на фронтенде они шли в правильном порядке
        const fieldsResult = await db.execute({
            sql: 'SELECT id, type, label, required, options, position FROM form_fields WHERE form_id = ? ORDER BY position ASC',
            args: [validatedUuid],
        });

        const fields: FormField[] = fieldsResult.rows.map((row) => ({
            id: row.id as string,
            type: row.type as string,
            label: row.label as string,
            required: Boolean(row.required),
            // Парсим JSON-строку обратно в массив строк
            options: row.options ? JSON.parse(row.options as string) : null,
            position: row.position as number,
        }));

        const form: FormDetail = {
            id: formRow.id as string,
            title: formRow.title as string,
            created_at: formRow.created_at as string,
            fields,
        };

        res.status(200).json(form);
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({ error: 'Invalid UUID format', details: error.issues });
        }
        console.error('Error fetching form:', error);
        res.status(500).json({ error: 'Failed to fetch form' });
    }
});

// Получение ответов на форму
app.get('/api/forms/:uuid/responses', async (req: Request, res: Response) => {
    try {
        const validatedUuid = uuidSchema.parse(req.params.uuid);

        const responsesResult = await db.execute({
            sql: 'SELECT id, data_json, created_at FROM responses WHERE form_id = ? ORDER BY created_at DESC',
            args: [validatedUuid],
        });

        const responses: ResponseItem[] = responsesResult.rows.map((row) => ({
            id: row.id as string,
            // Преобразуем сохраненную JSON-строку обратно в JS-объект
            data: JSON.parse(row.data_json as string),
            created_at: row.created_at as string,
        }));

        res.status(200).json(responses);
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({ error: 'Invalid UUID format', details: error.issues });
        }
        console.error('Error fetching responses:', error);
        res.status(500).json({ error: 'Failed to fetch responses' });
    }
});

// Отправка ответа студентом
app.post('/api/forms/:uuid/responses', async (req: Request, res: Response) => {
    try {
        const validatedUuid = uuidSchema.parse(req.params.uuid);

        // 1. Достаем метаданные полей, чтобы знать, как валидировать пришедшие данные
        const fieldsResult = await db.execute({
            sql: 'SELECT id, type, required FROM form_fields WHERE form_id = ?',
            args: [validatedUuid],
        });

        // 2. Динамически собираем Zod-схему. Ключами будут ID полей.
        const shape: Record<string, z.ZodTypeAny> = {};

        for (const row of fieldsResult.rows) {
            const fieldId = row.id as string;
            const type = row.type as string;
            const isRequired = Boolean(row.required);

            if (type === 'checkbox') {
                // Чекбокс может прийти как boolean или как строка 'true' из HTML-формы
                const baseSchema = z.union([z.boolean(), z.literal('true'), z.literal('false')]);
                shape[fieldId] = isRequired
                    ? baseSchema.refine((val) => val === true || val === 'true', { message: 'Обязательное поле' })
                    : baseSchema.optional();
            } else if (type === 'number') {
                // z.coerce.number() пытается превратить строку "123" в число 123
                const baseSchema = z.coerce.number();
                shape[fieldId] = isRequired
                    ? baseSchema.refine((val) => !isNaN(val), { message: 'Должно быть числом' })
                    : baseSchema.optional();
            } else {
                // Для text и select
                shape[fieldId] = isRequired
                    ? z.string().min(1, 'Обязательное поле')
                    : z.string().optional();
            }
        }

        // 3. Валидируем req.body против только что собранной уникальной схемы
        const dynamicResponseSchema = z.object(shape);
        const validatedData = dynamicResponseSchema.parse(req.body);

        // 4. Сохраняем валидный объект как JSON-строку
        const responseId = uuidv4();
        await db.execute({
            sql: 'INSERT INTO responses (id, form_id, data_json) VALUES (?, ?, ?)',
            args: [responseId, validatedUuid, JSON.stringify(validatedData)],
        });

        res.status(201).json({ id: responseId, message: 'Response submitted successfully' });
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({ error: 'Invalid response data', details: error.issues });
        }
        console.error('Error submitting response:', error);
        res.status(500).json({ error: 'Failed to submit response' });
    }
});

// Трекинг дропаута (ухода со страницы)
app.post('/api/forms/:uuid/dropoff', async (req: Request, res: Response) => {
    try {
        const validatedUuid = uuidSchema.parse(req.params.uuid);
        const validatedBody = dropoffSchema.parse(req.body);

        // Записываем событие
        await db.execute({
            sql: 'INSERT INTO dropoff_events (id, form_id, field_id) VALUES (?, ?, ?)',
            args: [uuidv4(), validatedUuid, validatedBody.fieldId],
        });

        // Браузер видит, что тело ответа пустое, и быстрее завершает фоновый запрос при закрытии вкладки.
        res.status(204).send();
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({ error: 'Invalid dropoff data', details: error.issues });
        }
        console.error('Error recording dropoff:', error);
        res.status(500).json({ error: 'Failed to record dropoff' });
    }
});

// Статистика дропаутов для админки
app.get('/api/forms/:uuid/dropoff-stats', async (req: Request, res: Response) => {
    try {
        const validatedUuid = uuidSchema.parse(req.params.uuid);

        // Группируем и считаем количество уходов по каждому полю
        const statsResult = await db.execute({
            sql: `SELECT field_id, COUNT(*) as count 
                  FROM dropoff_events 
                  WHERE form_id = ? 
                  GROUP BY field_id 
                  ORDER BY count DESC`,
            args: [validatedUuid],
        });

        // Делаем отдельный запрос, чтобы получить человекочитаемые названия полей
        const fieldsResult = await db.execute({
            sql: 'SELECT id, label FROM form_fields WHERE form_id = ?',
            args: [validatedUuid],
        });

        // Создаем словарь для быстрого поиска названия по ID
        const fieldLabels = new Map<string, string>();
        for (const row of fieldsResult.rows) {
            fieldLabels.set(row.id as string, row.label as string);
        }

        // Собираем итоговый массив для фронтенда
        const stats = statsResult.rows.map((row) => ({
            fieldId: row.field_id as string,
            fieldLabel: fieldLabels.get(row.field_id as string) || 'Неизвестное поле',
            count: row.count as number,
        }));

        res.status(200).json(stats);
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({ error: 'Invalid UUID format', details: error.issues });
        }
        console.error('Error fetching dropoff stats:', error);
        res.status(500).json({ error: 'Failed to fetch dropoff stats' });
    }
});


// статика и catch-all
async function start() {
    try {
        await initDb();
        console.log('Database initialized successfully.');

        const PORT = Number(process.env.PORT) || 3000;
        const frontendDistPath = path.join(__dirname, '../frontend/dist');

        // 1. Раздаем статические файлы, собранные Vite
        app.use(express.static(frontendDistPath));

        // 2. Catch-all роут: если запрос не совпал ни с одним /api выше
        // и не является файлом в dist, отдаем index.html.
        // Это позволяет обрабатывать пути вроде /admin или /f/uuid на клиенте
        app.get('*', (_req: Request, res: Response) => {
            res.sendFile(path.join(frontendDistPath, 'index.html'));
        });

        // 3. Глобальный обработчик ошибок Express.
        app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
            console.error('Unhandled server error:', err.message);
            res.status(500).json({ error: 'Internal server error' });
        });

        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start().catch(console.error);