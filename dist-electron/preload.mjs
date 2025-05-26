"use strict";const o=require("electron");o.contextBridge.exposeInMainWorld("ipcRenderer",{on(...e){const[n,t]=e;return o.ipcRenderer.on(n,(i,...d)=>t(i,...d))},off(...e){const[n,...t]=e;return o.ipcRenderer.off(n,...t)},send(...e){const[n,...t]=e;return o.ipcRenderer.send(n,...t)},invoke(...e){const[n,...t]=e;return o.ipcRenderer.invoke(n,...t)}});function s(e=["complete","interactive"]){return new Promise(n=>{e.includes(document.readyState)?n(!0):document.addEventListener("readystatechange",()=>{e.includes(document.readyState)&&n(!0)})})}const r={append(e,n){Array.from(e.children).find(t=>t===n)||e.appendChild(n)},remove(e,n){Array.from(e.children).find(t=>t===n)&&e.removeChild(n)}};function c(){const e="loaders-css__square-spin",n=`
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${e} > div {
  display: flex;
  align-items: center;
  justify-content: center;
  animation-fill-mode: both;
  width: 80px;
  height: 80px;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `,t=document.createElement("style"),i=document.createElement("div");return t.id="app-loading-style",t.innerHTML=n,i.className="app-loading-wrap",i.innerHTML=`<div class="${e}"><div><img src="./icon.ico" style="width: 80px; height: 80px;" /> </div></div>`,{appendLoading(){r.append(document.head,t),r.append(document.body,i)},removeLoading(){r.remove(document.head,t),r.remove(document.body,i)}}}const{appendLoading:p,removeLoading:a}=c();s().then(p);window.onmessage=e=>{e.data.payload==="removeLoading"&&a()};setTimeout(a,2999);
