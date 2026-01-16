import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

// 创建实例
const http: AxiosInstance = axios.create({
    // baseURL: import.meta.env.DEV ? 'http://localhost:10010' : '/apis',
    baseURL: 'http://localhost:10010',
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// 请求拦截器（可选： token）
http.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        // const token = localStorage.getItem('token');
        // if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
    },
    (error) => Promise.reject(error)
);

// 响应拦截器：统一处理错误
http.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        let message = '网络错误';
        if (error.response) {
            // 服务端返回状态码非 2xx
            // const { status } = error.response
            // 服务端返回错误
            const data = error.response.data as any;
            message = data?.message || error.response.statusText || '请求失败';
        } else if (error.request) {
            message = '网络连接异常，请检查网络';
        }
        // 触发全局提示（如 message.error(message)）
        return Promise.reject(message);
    }
);

export async function postRequest<T, K = unknown>(url: string, params?: K, config?: any): Promise<T> {
    try {
        const res = await http.post<T>(url, params, config)
        return res.data
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data?.message || error.message || '请求失败');
        }
        throw error;
    }
}

export async function getRequest<T, K = Record<string, any>>(url: string, params?: K): Promise<T> {
    try {
        const res = await http.get<T>(url, { params })
        return res.data
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data?.message || error.message || '请求失败');
        }
        throw error;
    }
}