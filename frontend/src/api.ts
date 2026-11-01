export interface ApiFormField {
    id: string;
    type: 'text' | 'number' | 'select' | 'checkbox';
    label: string;
    required: boolean;
    options: string[] | null;
    position: number;
}

export interface ApiForm {
    id: string;
    title: string;
    created_at: string;
    fields?: ApiFormField[]; // Поля есть только при запросе конкретной формы
}

const API_BASE = '/api';

// Вспомогательная функция для обработки ответов и ошибок
async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${res.status}`);
    }

    // Если статус 204 No Content, возвращаем null
    if (res.status === 204) return null as unknown as T;

    return res.json();
}

export interface DropoffStat {
    fieldId: string;
    fieldLabel: string;
    count: number;
}

export const api = {
    getForms: () => fetchApi<ApiForm[]>('/forms'),

    createForm: (data: { title: string; fields: Omit<ApiFormField, 'id'>[] }) =>
        fetchApi<{ id: string; message: string }>('/forms', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    getFormByUuid: (uuid: string) => fetchApi<ApiForm>(`/forms/${uuid}`),

    submitResponse: (uuid: string, data: Record<string, string | boolean | number>) =>
        fetchApi<{ id: string; message: string }>(`/forms/${uuid}/responses`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    getResponses: (uuid: string) => fetchApi<ResponseItem[]>(`/forms/${uuid}/responses`),
    getDropoffStats: (uuid: string) => fetchApi<DropoffStat[]>(`/forms/${uuid}/dropoff-stats`)
};
export interface ResponseItem {
    id: string;
    data: Record<string, unknown>;
    created_at: string;
}
