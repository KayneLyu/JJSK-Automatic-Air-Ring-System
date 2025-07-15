import axios, { AxiosResponse } from "axios";

export const client = axios.create({
    headers: {
        // "Content-Type": "application/json"
        // kundig
        "Content-Type":'application/x-www-form-urlencoded; charset=UTF-8'
    }
})

export const postRequest = async (url: string, params?: any): Promise<AxiosResponse> => {
    try {
        const result = await client.post(url, params)
        return result
    } catch (error:any) {
        throw new Error(error)
    }
}

export const getRequest = async (url: string, params?: any): Promise<AxiosResponse> => {
    try {
        const result = await client.post(url, params)
        return result
    } catch (error:any) {
        console.log("request error =>", error);
        throw new Error(error)
    }
}

export const formateResult = async<T>(result: Promise<AxiosResponse>): Promise<T> => {
    const { data, status, statusText } = await result
    if (status === 200 || status === 204) {
        return data
    } else {
        throw new Error(statusText)
    }
}