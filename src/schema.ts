import { z } from 'zod';

// Базовая схема одного поля формы.
// Используем её и при создании формы, и как основу для других схем.
export const formFieldSchema = z.object({
    type: z.enum(['text', 'number', 'select', 'checkbox']),
    label: z.string().min(1, 'Название поля обязательно'),
    required: z.boolean(),
    // Разрешаем и undefined, и null, так как фронтенд может прислать null
    options: z.array(z.string()).optional().nullable(),
    position: z.number().int().min(0),
});

// Схема для создания всей формы целиком
export const createFormSchema = z.object({
    title: z.string().min(1, 'Название формы обязательно'),
    fields: z.array(formFieldSchema).min(1, 'Форма должна содержать хотя бы одно поле'),
});

// Схема для валидации UUID в параметрах URL
// Отсекает некорректные запросы до того, как они дойдут до бд
export const uuidSchema = z.string().uuid('Некорректный UUID');

// Схема для события дропаута: нам нужен только ID поля, на котором произошел уход
export const dropoffSchema = z.object({
    fieldId: uuidSchema,
});

// Типы для ответов API. Вынесены отдельно, чтобы не дублировать структуру в разных местах.
export interface FormListItem {
    id: string;
    title: string;
    created_at: string;
}

export interface FormField {
    id: string;
    type: string;
    label: string;
    required: boolean;
    options: string[] | null;
    position: number;
}

export interface FormDetail {
    id: string;
    title: string;
    created_at: string;
    fields: FormField[];
}

export interface ResponseItem {
    id: string;
    data: Record<string, unknown>;
    created_at: string;
}