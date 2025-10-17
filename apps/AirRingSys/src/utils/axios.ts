import axios, { AxiosResponse } from 'axios'

export const client = axios.create({
  baseURL: 'http://localhost:10010',
  // baseURL: 'apis',
  headers: {
    'Content-Type': 'application/json',
  },
})

export const postRequest = async (
  url: string,
  params?: any
): Promise<AxiosResponse> => {
  try {
    return await client.post(url, params)
  } catch (error: any) {
    throw new Error(error)
  }
}

export const formateResult = async <T>(
  result: Promise<AxiosResponse>
): Promise<T> => {
  const { data, status, statusText } = await result
  if (status === 200 || status === 204) {
    return data
  } else {
    throw new Error(statusText)
  }
}
