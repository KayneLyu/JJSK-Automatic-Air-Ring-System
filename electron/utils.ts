import { spawn, execSync } from 'child_process';
import { Dialog } from 'electron';
// 启动第三方exe
function runAppInBackground(exePath: string) {
    const options = {
        detached: true,
        windowsHide: true,
        cwd: 'D:/server/',
    };
    const child = spawn(exePath, [], options);
    child.unref(); // 让子进程独立运行，使其不受主进程关闭的影响
}
// 判断第三方exe是否启动
function isExeRunning(exeName: string) {
    try {
        // 使用tasklist命令来列出当前运行的进程，并使用find命令查找指定的exe名称
        const output = execSync(`tasklist /FI "IMAGENAME eq ${exeName}.exe"`);
        return output.includes(exeName);
    } catch (error) {
        console.error(error);
        return false;
    }
}


export function ensureServerRunning(exeName: string, exePath: string, dialog: Dialog) {
    try {
        if (!isExeRunning(exeName)) {
            runAppInBackground(exePath);
        }
    } catch (error) {
        dialog.showErrorBox(`Error checking or running ${exeName}:`, error + '')
    }
}
