// 封装通用的通知方法
export const showNotification = (titleKey: string, messageKey: string, type: 'success' | 'error' | 'info' | 'warning') => {
    ElNotification({
       title: titleKey,
       message: messageKey,
       type,
       position: 'bottom-left',
    });
 };