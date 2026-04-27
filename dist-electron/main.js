var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { dialog, ipcMain, app, globalShortcut, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs";
import require$$0$4, { spawn, execSync } from "child_process";
import require$$1$1 from "net";
import require$$1$2 from "util";
import require$$0 from "tty";
import require$$0$1 from "os";
import require$$0$3 from "events";
import require$$0$2 from "stream";
import require$$1$3 from "path";
import require$$1$4 from "dgram";
function runAppInBackground(exePath) {
  const options = {
    detached: true,
    windowsHide: true,
    cwd: "D:/server/"
  };
  const child = spawn(exePath, [], options);
  child.unref();
}
function isExeRunning(exeName) {
  try {
    const output = execSync(`tasklist /FI "IMAGENAME eq ${exeName}.exe"`);
    return output.includes(exeName);
  } catch (error) {
    console.error(error);
    return false;
  }
}
function ensureServerRunning(exeName, exePath, dialog2) {
  try {
    if (!isExeRunning(exeName)) {
      runAppInBackground(exePath);
      return true;
    } else {
      return false;
    }
  } catch (error) {
    dialog2.showErrorBox(`Error checking or running ${exeName}:`, error + "");
  }
}
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var net = require$$1$1;
var util = require$$1$2;
var effectiveDebugLevel = 0;
var silentMode = false;
var nodeS7 = NodeS7;
function NodeS7(opts) {
  opts = opts || {};
  silentMode = opts.silent || false;
  effectiveDebugLevel = opts.debug ? 99 : 0;
  var self2 = this;
  self2.connectReq = Buffer.from([3, 0, 0, 22, 17, 224, 0, 0, 0, 2, 0, 192, 1, 10, 193, 2, 1, 0, 194, 2, 1, 2]);
  self2.negotiatePDU = Buffer.from([3, 0, 0, 25, 2, 240, 128, 50, 1, 0, 0, 0, 0, 0, 8, 0, 0, 240, 0, 0, 8, 0, 8, 3, 192]);
  self2.readReqHeader = Buffer.from([3, 0, 0, 31, 2, 240, 128, 50, 1, 0, 0, 8, 0, 0, 14, 0, 0, 4, 1]);
  self2.readReq = Buffer.alloc(1500);
  self2.writeReqHeader = Buffer.from([3, 0, 0, 31, 2, 240, 128, 50, 1, 0, 0, 8, 0, 0, 14, 0, 0, 5, 1]);
  self2.writeReq = Buffer.alloc(1500);
  self2.resetPending = false;
  self2.resetTimeout = void 0;
  self2.isoclient = void 0;
  self2.isoConnectionState = 0;
  self2.requestMaxPDU = 960;
  self2.maxPDU = 960;
  self2.requestMaxParallel = 8;
  self2.maxParallel = 8;
  self2.parallelJobsNow = 0;
  self2.maxGap = 5;
  self2.doNotOptimize = false;
  self2.connectCallback = void 0;
  self2.readDoneCallback = void 0;
  self2.writeDoneCallback = void 0;
  self2.connectTimeout = void 0;
  self2.PDUTimeout = void 0;
  self2.globalTimeout = 1500;
  self2.rack = 0;
  self2.slot = 2;
  self2.localTSAP = null;
  self2.remoteTSAP = null;
  self2.readPacketArray = [];
  self2.writePacketArray = [];
  self2.polledReadBlockList = [];
  self2.instantWriteBlockList = [];
  self2.globalReadBlockList = [];
  self2.globalWriteBlockList = [];
  self2.masterSequenceNumber = 1;
  self2.translationCB = doNothing;
  self2.connectionParams = void 0;
  self2.connectionID = "UNDEF";
  self2.addRemoveArray = [];
  self2.readPacketValid = false;
  self2.writeInQueue = false;
  self2.connectCBIssued = false;
  self2.dropConnectionCallback = null;
  self2.dropConnectionTimer = null;
  self2.reconnectTimer = void 0;
  self2.rereadTimer = void 0;
}
NodeS7.prototype.getNextSeqNum = function() {
  var self2 = this;
  self2.masterSequenceNumber += 1;
  if (self2.masterSequenceNumber > 32767) {
    self2.masterSequenceNumber = 1;
  }
  outputLog("seqNum is " + self2.masterSequenceNumber, 1, self2.connectionID);
  return self2.masterSequenceNumber;
};
NodeS7.prototype.setTranslationCB = function(cb) {
  var self2 = this;
  if (typeof cb === "function") {
    outputLog("Translation OK");
    self2.translationCB = cb;
  }
};
NodeS7.prototype.initiateConnection = function(cParam, callback) {
  var self2 = this;
  if (cParam === void 0) {
    cParam = { port: 102, host: "192.168.8.106" };
  }
  outputLog("Initiate Called - Connecting to PLC with address and parameters:");
  outputLog(cParam);
  if (typeof cParam.rack !== "undefined") {
    self2.rack = cParam.rack;
  }
  if (typeof cParam.slot !== "undefined") {
    self2.slot = cParam.slot;
  }
  if (typeof cParam.localTSAP !== "undefined") {
    self2.localTSAP = cParam.localTSAP;
  }
  if (typeof cParam.remoteTSAP !== "undefined") {
    self2.remoteTSAP = cParam.remoteTSAP;
  }
  if (typeof cParam.connection_name === "undefined") {
    self2.connectionID = cParam.host + " S" + self2.slot;
  } else {
    self2.connectionID = cParam.connection_name;
  }
  if (typeof cParam.doNotOptimize !== "undefined") {
    self2.doNotOptimize = cParam.doNotOptimize;
  }
  if (typeof cParam.timeout !== "undefined") {
    self2.globalTimeout = cParam.timeout;
  }
  self2.connectionParams = cParam;
  self2.connectCallback = callback;
  self2.connectCBIssued = false;
  self2.connectNow(self2.connectionParams, false);
};
NodeS7.prototype.dropConnection = function(callback) {
  var self2 = this;
  clearTimeout(self2.reconnectTimer);
  clearTimeout(self2.rereadTimer);
  clearTimeout(self2.connectTimeout);
  clearTimeout(self2.PDUTimeout);
  self2.reconnectTimer = void 0;
  self2.rereadTimer = void 0;
  self2.connectTimeout = void 0;
  self2.PDUTimeout = void 0;
  if (typeof self2.isoclient !== "undefined") {
    self2.dropConnectionCallback = callback;
    self2.isoclient.end();
    self2.dropConnectionTimer = setTimeout(function() {
      if (self2.dropConnectionCallback) {
        self2.connectionCleanup();
        self2.dropConnectionCallback();
        self2.dropConnectionCallback = null;
      }
    }, 2500);
  } else {
    callback();
  }
};
NodeS7.prototype.connectNow = function(cParam) {
  var self2 = this;
  clearTimeout(self2.reconnectTimer);
  self2.reconnectTimer = void 0;
  if (self2.isoConnectionState >= 1) {
    return;
  }
  self2.connectionCleanup();
  self2.isoclient = net.connect(cParam);
  self2.isoclient.setTimeout(cParam.timeout || 5e3, () => {
    self2.isoclient.destroy();
    self2.connectError.apply(self2, [{ code: "EUSERTIMEOUT" }]);
  });
  self2.isoclient.once("connect", () => {
    self2.isoclient.setTimeout(0);
    self2.onTCPConnect.apply(self2, arguments);
  });
  self2.isoConnectionState = 1;
  self2.isoclient.on("error", function() {
    self2.connectError.apply(self2, arguments);
  });
  outputLog("<initiating a new connection " + Date() + ">", 1, self2.connectionID);
  outputLog("Attempting to connect to host...", 0, self2.connectionID);
};
NodeS7.prototype.connectError = function(e) {
  var self2 = this;
  outputLog("We Caught a connect error " + e.code, 0, self2.connectionID);
  if (!self2.connectCBIssued && typeof self2.connectCallback === "function") {
    self2.connectCBIssued = true;
    self2.connectCallback(e);
  }
  self2.isoConnectionState = 0;
};
NodeS7.prototype.readWriteError = function(e) {
  var self2 = this;
  outputLog("We Caught a read/write error " + e.code + " - will DISCONNECT and attempt to reconnect.");
  self2.isoConnectionState = 0;
  self2.connectionReset();
};
NodeS7.prototype.packetTimeout = function(packetType, packetSeqNum) {
  var self2 = this;
  outputLog("PacketTimeout called with type " + packetType + " and seq " + packetSeqNum, 1, self2.connectionID);
  if (packetType === "connect") {
    outputLog("TIMED OUT connecting to the PLC - Disconnecting", 0, self2.connectionID);
    outputLog("Wait for 2 seconds then try again.", 0, self2.connectionID);
    self2.connectionReset();
    outputLog("Scheduling a reconnect from packetTimeout, connect type", 0, self2.connectionID);
    clearTimeout(self2.reconnectTimer);
    self2.reconnectTimer = setTimeout(function() {
      outputLog("The scheduled reconnect from packetTimeout, connect type, is happening now", 0, self2.connectionID);
      if (self2.isoConnectionState === 0) {
        self2.connectNow.apply(self2, arguments);
      }
    }, 2e3, self2.connectionParams);
    return void 0;
  }
  if (packetType === "PDU") {
    outputLog("TIMED OUT waiting for PDU reply packet from PLC - Disconnecting");
    outputLog("Wait for 2 seconds then try again.", 0, self2.connectionID);
    self2.connectionReset();
    outputLog("Scheduling a reconnect from packetTimeout, connect type", 0, self2.connectionID);
    clearTimeout(self2.reconnectTimer);
    self2.reconnectTimer = setTimeout(function() {
      outputLog("The scheduled reconnect from packetTimeout, PDU type, is happening now", 0, self2.connectionID);
      self2.connectNow.apply(self2, arguments);
    }, 2e3, self2.connectionParams);
    return void 0;
  }
  if (packetType === "read") {
    outputLog("READ TIMEOUT on sequence number " + packetSeqNum, 0, self2.connectionID);
    if (self2.isoConnectionState === 4) {
      outputLog("ConnectionReset from read packet timeout.", 0, self2.connectionID);
      self2.connectionReset();
    }
    self2.readResponse(void 0, self2.findReadIndexOfSeqNum(packetSeqNum));
    return void 0;
  }
  if (packetType === "write") {
    outputLog("WRITE TIMEOUT on sequence number " + packetSeqNum, 0, self2.connectionID);
    if (self2.isoConnectionState === 4) {
      outputLog("ConnectionReset from write packet timeout.", 0, self2.connectionID);
      self2.connectionReset();
    }
    self2.writeResponse(void 0, self2.findWriteIndexOfSeqNum(packetSeqNum));
    return void 0;
  }
  outputLog("Unknown timeout error.  Nothing was done - this shouldn't happen.");
};
NodeS7.prototype.onTCPConnect = function() {
  var self2 = this, connBuf;
  outputLog("TCP Connection Established to " + self2.isoclient.remoteAddress + " on port " + self2.isoclient.remotePort, 0, self2.connectionID);
  outputLog("Will attempt ISO-on-TCP connection", 0, self2.connectionID);
  self2.isoConnectionState = 2;
  self2.connectTimeout = setTimeout(function() {
    self2.packetTimeout.apply(self2, arguments);
  }, self2.globalTimeout, "connect");
  connBuf = self2.connectReq.slice();
  if (self2.localTSAP !== null && self2.remoteTSAP !== null) {
    outputLog("Using localTSAP [0x" + self2.localTSAP.toString(16) + "] and remoteTSAP [0x" + self2.remoteTSAP.toString(16) + "]", 0, self2.connectionID);
    connBuf.writeUInt16BE(self2.localTSAP, 16);
    connBuf.writeUInt16BE(self2.remoteTSAP, 20);
  } else {
    outputLog("Using rack [" + self2.rack + "] and slot [" + self2.slot + "]", 0, self2.connectionID);
    connBuf[21] = self2.rack * 32 + self2.slot;
  }
  self2.isoclient.write(connBuf);
  self2.isoclient.on("data", function() {
    self2.onISOConnectReply.apply(self2, arguments);
  });
  self2.isoclient.on("end", function() {
    self2.onClientDisconnect.apply(self2, arguments);
  });
  self2.isoclient.on("close", function() {
    self2.onClientClose.apply(self2, arguments);
  });
};
NodeS7.prototype.onISOConnectReply = function(data) {
  var self2 = this;
  self2.isoclient.removeAllListeners("data");
  clearTimeout(self2.connectTimeout);
  if (self2.isoConnectionState != 2) {
    outputLog("Ignoring ISO connect reply, expecting isoConnectionState of 2, is currently " + self2.isoConnectionState, 0, self2.connectionID);
    return;
  }
  self2.isoConnectionState = 3;
  if (data.readInt16BE(2) !== data.length || data.length < 22 || data[5] !== 208 || data[4] !== data.length - 5) {
    outputLog("INVALID PACKET or CONNECTION REFUSED - DISCONNECTING");
    outputLog(data);
    outputLog("TPKT Length From Header is " + data.readInt16BE(2) + " and RCV buffer length is " + data.length + " and COTP length is " + data.readUInt8(4) + " and data[5] is " + data[5]);
    self2.connectionReset();
    return null;
  }
  outputLog("ISO-on-TCP Connection Confirm Packet Received", 0, self2.connectionID);
  self2.negotiatePDU.writeInt16BE(self2.requestMaxParallel, 19);
  self2.negotiatePDU.writeInt16BE(self2.requestMaxParallel, 21);
  self2.negotiatePDU.writeInt16BE(self2.requestMaxPDU, 23);
  self2.PDUTimeout = setTimeout(function() {
    self2.packetTimeout.apply(self2, arguments);
  }, self2.globalTimeout, "PDU");
  self2.isoclient.write(self2.negotiatePDU.slice(0, 25));
  self2.isoclient.on("data", function() {
    self2.onPDUReply.apply(self2, arguments);
  });
  self2.isoclient.removeAllListeners("error");
  self2.isoclient.on("error", function() {
    self2.readWriteError.apply(self2, arguments);
  });
};
NodeS7.prototype.onPDUReply = function(theData) {
  var self2 = this;
  self2.isoclient.removeAllListeners("data");
  self2.isoclient.removeAllListeners("error");
  clearTimeout(self2.PDUTimeout);
  var data = checkRFCData(theData);
  if (data === "fastACK") {
    outputLog("Fast Acknowledge received.", 0, self2.connectionID);
    self2.isoclient.removeAllListeners("error");
    self2.isoclient.removeAllListeners("data");
    self2.isoclient.on("data", function() {
      self2.onPDUReply.apply(self2, arguments);
    });
    self2.isoclient.on("error", function() {
      self2.readWriteError.apply(self2, arguments);
    });
  } else if (data[4] + 1 + 12 + data.readInt16BE(13) === data.readInt16BE(2) - 4) {
    self2.isoConnectionState = 4;
    self2.parallelJobsNow = 0;
    var partnerMaxParallel1 = data.readInt16BE(21);
    var partnerMaxParallel2 = data.readInt16BE(23);
    var partnerPDU = data.readInt16BE(25);
    self2.maxParallel = self2.requestMaxParallel;
    if (partnerMaxParallel1 < self2.requestMaxParallel) {
      self2.maxParallel = partnerMaxParallel1;
    }
    if (partnerMaxParallel2 < self2.requestMaxParallel) {
      self2.maxParallel = partnerMaxParallel2;
    }
    if (partnerPDU < self2.requestMaxPDU) {
      self2.maxPDU = partnerPDU;
    } else {
      self2.maxPDU = self2.requestMaxPDU;
    }
    outputLog("Received PDU Response - Proceeding with PDU " + self2.maxPDU + " and " + self2.maxParallel + " max parallel connections.", 0, self2.connectionID);
    self2.isoclient.on("data", function() {
      self2.onResponse.apply(self2, arguments);
    });
    self2.isoclient.on("error", function() {
      self2.readWriteError.apply(self2, arguments);
    });
    if (!self2.connectCBIssued && typeof self2.connectCallback === "function") {
      self2.connectCBIssued = true;
      self2.connectCallback();
    }
  } else {
    outputLog("INVALID Telegram ", 0, self2.connectionID);
    outputLog("Byte 0 From Header is " + theData[0] + " it has to be 0x03, Byte 5 From Header is  " + theData[5] + " and it has to be 0x0F ", 0, self2.connectionID);
    outputLog("INVALID PDU RESPONSE or CONNECTION REFUSED - DISCONNECTING", 0, self2.connectionID);
    outputLog("TPKT Length From Header is " + theData.readInt16BE(2) + " and RCV buffer length is " + theData.length + " and COTP length is " + theData.readUInt8(4) + " and data[6] is " + theData[6], 0, self2.connectionID);
    outputLog(theData);
    self2.isoclient.end();
    clearTimeout(self2.reconnectTimer);
    self2.reconnectTimer = setTimeout(function() {
      self2.connectNow.apply(self2, arguments);
    }, 2e3, self2.connectionParams);
    return null;
  }
};
NodeS7.prototype.writeItems = function(arg, value, cb) {
  var self2 = this, i;
  outputLog("Preparing to WRITE " + arg + " to value " + value, 0, self2.connectionID);
  if (self2.isWriting() || self2.writeInQueue) {
    outputLog("You must wait until all previous writes have finished before scheduling another. ", 0, self2.connectionID);
    return 1;
  }
  if (typeof cb === "function") {
    self2.writeDoneCallback = cb;
  } else {
    self2.writeDoneCallback = doNothing;
  }
  self2.instantWriteBlockList = [];
  if (typeof arg === "string") {
    self2.instantWriteBlockList.push(stringToS7Addr(self2.translationCB(arg), arg, self2.connectionParams));
    if (typeof self2.instantWriteBlockList[self2.instantWriteBlockList.length - 1] !== "undefined") {
      self2.instantWriteBlockList[self2.instantWriteBlockList.length - 1].writeValue = value;
    }
  } else if (Array.isArray(arg) && Array.isArray(value) && arg.length == value.length) {
    for (i = 0; i < arg.length; i++) {
      if (typeof arg[i] === "string") {
        self2.instantWriteBlockList.push(stringToS7Addr(self2.translationCB(arg[i]), arg[i], self2.connectionParams));
        if (typeof self2.instantWriteBlockList[self2.instantWriteBlockList.length - 1] !== "undefined") {
          self2.instantWriteBlockList[self2.instantWriteBlockList.length - 1].writeValue = value[i];
        }
      }
    }
  }
  for (i = self2.instantWriteBlockList.length - 1; i >= 0; i--) {
    if (self2.instantWriteBlockList[i] === void 0) {
      self2.instantWriteBlockList.splice(i, 1);
      outputLog("Dropping an undefined write item.");
    }
  }
  self2.prepareWritePacket();
  if (!self2.isReading()) {
    self2.sendWritePacket();
  } else {
    if (self2.writeInQueue) {
      outputLog("Write was already in queue - should be prevented above", 1, self2.connectionID);
    }
    self2.writeInQueue = true;
    outputLog("Adding write to queue");
  }
  return 0;
};
NodeS7.prototype.findItem = function(useraddr) {
  var self2 = this, i;
  var commstate = { value: self2.isoConnectionState !== 4, quality: "OK" };
  if (useraddr === "_COMMERR") {
    return commstate;
  }
  for (i = 0; i < self2.polledReadBlockList.length; i++) {
    if (self2.polledReadBlockList[i].useraddr === useraddr) {
      return self2.polledReadBlockList[i];
    }
  }
  return void 0;
};
NodeS7.prototype.addItems = function(arg) {
  var self2 = this;
  self2.addRemoveArray.push({ arg, action: "add" });
};
NodeS7.prototype.addItemsNow = function(arg) {
  var self2 = this, i;
  outputLog("Adding " + arg, 0, self2.connectionID);
  if (typeof arg === "string" && arg !== "_COMMERR") {
    self2.polledReadBlockList.push(stringToS7Addr(self2.translationCB(arg), arg, self2.connectionParams));
  } else if (Array.isArray(arg)) {
    for (i = 0; i < arg.length; i++) {
      if (typeof arg[i] === "string" && arg[i] !== "_COMMERR") {
        self2.polledReadBlockList.push(stringToS7Addr(self2.translationCB(arg[i]), arg[i], self2.connectionParams));
      }
    }
  }
  for (i = self2.polledReadBlockList.length - 1; i >= 0; i--) {
    if (self2.polledReadBlockList[i] === void 0) {
      self2.polledReadBlockList.splice(i, 1);
      outputLog("Dropping an undefined request item.", 0, self2.connectionID);
    }
  }
  self2.readPacketValid = false;
};
NodeS7.prototype.removeItems = function(arg) {
  var self2 = this;
  self2.addRemoveArray.push({ arg, action: "remove" });
};
NodeS7.prototype.removeItemsNow = function(arg) {
  var self2 = this, i;
  if (typeof arg === "undefined") {
    self2.polledReadBlockList = [];
  } else if (typeof arg === "string") {
    for (i = 0; i < self2.polledReadBlockList.length; i++) {
      outputLog("TCBA " + self2.translationCB(arg));
      if (self2.polledReadBlockList[i].addr === self2.translationCB(arg)) {
        outputLog("Splicing");
        self2.polledReadBlockList.splice(i, 1);
      }
    }
  } else if (Array.isArray(arg)) {
    for (i = 0; i < self2.polledReadBlockList.length; i++) {
      for (var j = 0; j < arg.length; j++) {
        if (self2.polledReadBlockList[i].addr === self2.translationCB(arg[j])) {
          self2.polledReadBlockList.splice(i, 1);
        }
      }
    }
  }
  self2.readPacketValid = false;
};
NodeS7.prototype.readAllItems = function(arg) {
  var self2 = this;
  outputLog("Reading All Items (readAllItems was called)", 1, self2.connectionID);
  if (typeof arg === "function") {
    self2.readDoneCallback = arg;
  } else {
    self2.readDoneCallback = doNothing;
  }
  if (self2.isoConnectionState !== 4) {
    outputLog("Unable to read when not connected. Return bad values.", 0, self2.connectionID);
  }
  if (self2.isWaiting()) {
    outputLog("Waiting to read for all R/W operations to complete.  Will re-trigger readAllItems in 100ms.", 0, self2.connectionID);
    clearTimeout(self2.rereadTimer);
    self2.rereadTimer = setTimeout(function() {
      self2.rereadTimer = void 0;
      self2.readAllItems.apply(self2, arguments);
    }, 100, arg);
    return;
  }
  self2.addRemoveArray.forEach(function(element) {
    outputLog("Adding or Removing " + util.format(element), 1, self2.connectionID);
    if (element.action === "remove") {
      self2.removeItemsNow(element.arg);
    }
    if (element.action === "add") {
      self2.addItemsNow(element.arg);
    }
  });
  self2.addRemoveArray = [];
  if (!self2.readPacketValid) {
    self2.prepareReadPacket();
  }
  outputLog("Calling SRP from RAI", 1, self2.connectionID);
  self2.sendReadPacket();
};
NodeS7.prototype.isWaiting = function() {
  var self2 = this;
  return self2.isReading() || self2.isWriting();
};
NodeS7.prototype.isReading = function() {
  var self2 = this, i;
  for (i = 0; i < self2.readPacketArray.length; i++) {
    if (self2.readPacketArray[i].sent === true) {
      return true;
    }
  }
  return false;
};
NodeS7.prototype.isWriting = function() {
  var self2 = this, i;
  for (i = 0; i < self2.writePacketArray.length; i++) {
    if (self2.writePacketArray[i].sent === true) {
      return true;
    }
  }
  return false;
};
NodeS7.prototype.clearReadPacketTimeouts = function() {
  var self2 = this, i;
  outputLog("Clearing read PacketTimeouts", 1, self2.connectionID);
  for (i = 0; i < self2.readPacketArray.length; i++) {
    clearTimeout(self2.readPacketArray[i].timeout);
    self2.readPacketArray[i].sent = false;
    self2.readPacketArray[i].rcvd = false;
  }
};
NodeS7.prototype.clearWritePacketTimeouts = function() {
  var self2 = this, i;
  outputLog("Clearing write PacketTimeouts", 1, self2.connectionID);
  for (i = 0; i < self2.writePacketArray.length; i++) {
    clearTimeout(self2.writePacketArray[i].timeout);
    self2.writePacketArray[i].sent = false;
    self2.writePacketArray[i].rcvd = false;
  }
};
NodeS7.prototype.prepareWritePacket = function() {
  var self2 = this, i;
  var itemList = self2.instantWriteBlockList;
  var requestList = [];
  var requestNumber = 0;
  itemList.sort(itemListSorter);
  if (itemList.length === 0) {
    return void 0;
  }
  self2.globalWriteBlockList = [];
  self2.globalWriteBlockList[0] = itemList[0];
  self2.globalWriteBlockList[0].itemReference = [];
  self2.globalWriteBlockList[0].itemReference.push(itemList[0]);
  var thisBlock = 0;
  itemList[0].block = thisBlock;
  var maxByteRequest = 4 * Math.floor((self2.maxPDU - 18 - 12) / 4);
  maxByteRequest = 8 * Math.floor((self2.maxPDU - 18 - 12) / 8);
  for (i = 0; i < itemList.length; i++) {
    self2.globalWriteBlockList[i] = itemList[i];
    self2.globalWriteBlockList[i].isOptimized = false;
    self2.globalWriteBlockList[i].itemReference = [];
    self2.globalWriteBlockList[i].itemReference.push(itemList[i]);
    bufferizeS7Item(itemList[i]);
  }
  var thisRequest = 0;
  for (i = 0; i < self2.globalWriteBlockList.length; i++) {
    var startByte = self2.globalWriteBlockList[i].offset;
    var remainingLength = self2.globalWriteBlockList[i].byteLength;
    var lengthOffset = 0;
    requestList[thisRequest] = self2.globalWriteBlockList[i].clone();
    self2.globalWriteBlockList[i].parts = Math.ceil(self2.globalWriteBlockList[i].byteLength / maxByteRequest);
    self2.globalWriteBlockList[i].requestReference = [];
    for (var j = 0; j < self2.globalWriteBlockList[i].parts; j++) {
      requestList[thisRequest] = self2.globalWriteBlockList[i].clone();
      self2.globalWriteBlockList[i].requestReference.push(requestList[thisRequest]);
      requestList[thisRequest].offset = startByte;
      requestList[thisRequest].byteLength = Math.min(maxByteRequest, remainingLength);
      requestList[thisRequest].byteLengthWithFill = requestList[thisRequest].byteLength;
      if (requestList[thisRequest].byteLengthWithFill % 2) {
        requestList[thisRequest].byteLengthWithFill += 1;
      }
      requestList[thisRequest].writeBuffer = self2.globalWriteBlockList[i].writeBuffer.slice(lengthOffset, lengthOffset + requestList[thisRequest].byteLengthWithFill);
      requestList[thisRequest].writeQualityBuffer = self2.globalWriteBlockList[i].writeQualityBuffer.slice(lengthOffset, lengthOffset + requestList[thisRequest].byteLengthWithFill);
      lengthOffset += self2.globalWriteBlockList[i].requestReference[j].byteLength;
      if (self2.globalWriteBlockList[i].parts > 1) {
        requestList[thisRequest].datatype = "BYTE";
        requestList[thisRequest].dtypelen = 1;
        requestList[thisRequest].arrayLength = requestList[thisRequest].byteLength;
      }
      remainingLength -= maxByteRequest;
      thisRequest++;
      startByte += maxByteRequest;
    }
  }
  self2.clearWritePacketTimeouts();
  self2.writePacketArray = [];
  while (requestNumber < requestList.length) {
    var numItems = 0;
    self2.writeReqHeader.copy(self2.writeReq, 0);
    var packetWriteLength = 10 + 4;
    self2.writePacketArray.push(new S7Packet());
    var thisPacketNumber = self2.writePacketArray.length - 1;
    self2.writePacketArray[thisPacketNumber].seqNum = self2.getNextSeqNum();
    self2.writePacketArray[thisPacketNumber].itemList = [];
    for (i = requestNumber; i < requestList.length; i++) {
      if (requestList[i].byteLengthWithFill + 12 + 4 + packetWriteLength > self2.maxPDU) {
        if (numItems === 0) {
          outputLog("breaking when we shouldn't, byte length with fill is  " + requestList[i].byteLengthWithFill + " max byte request " + maxByteRequest, 0, self2.connectionID);
          throw new Error("Somehow write request didn't split properly - exiting.  Report this as a bug.");
        }
        break;
      }
      requestNumber++;
      numItems++;
      packetWriteLength += requestList[i].byteLengthWithFill + 12 + 4;
      self2.writePacketArray[thisPacketNumber].itemList.push(requestList[i]);
    }
  }
};
NodeS7.prototype.prepareReadPacket = function() {
  var self2 = this, i;
  var itemList = self2.polledReadBlockList;
  var requestList = [];
  for (i = itemList.length - 1; i >= 0; i--) {
    if (itemList[i] === void 0) {
      itemList.splice(i, 1);
      outputLog("Dropping an undefined request item.", 0, self2.connectionID);
    }
  }
  itemList.sort(itemListSorter);
  if (itemList.length === 0) {
    return void 0;
  }
  self2.globalReadBlockList = [];
  self2.globalReadBlockList[0] = itemList[0];
  self2.globalReadBlockList[0].itemReference = [];
  self2.globalReadBlockList[0].itemReference.push(itemList[0]);
  var thisBlock = 0;
  itemList[0].block = thisBlock;
  var maxByteRequest = 4 * Math.floor((self2.maxPDU - 18) / 4);
  for (i = 1; i < itemList.length; i++) {
    if (itemList[i].areaS7Code !== self2.globalReadBlockList[thisBlock].areaS7Code || // Can't optimize between areas
    itemList[i].dbNumber !== self2.globalReadBlockList[thisBlock].dbNumber || // Can't optimize across DBs
    !self2.isOptimizableArea(itemList[i].areaS7Code) || // Can't optimize T,C (I don't think) and definitely not P.
    itemList[i].offset - self2.globalReadBlockList[thisBlock].offset + itemList[i].byteLength > maxByteRequest || // If this request puts us over our max byte length, create a new block for consistency reasons.
    itemList[i].offset - (self2.globalReadBlockList[thisBlock].offset + self2.globalReadBlockList[thisBlock].byteLength) > self2.maxGap) {
      outputLog("Skipping optimization of item " + itemList[i].addr, 0, self2.connectionID);
      thisBlock = thisBlock + 1;
      self2.globalReadBlockList[thisBlock] = itemList[i];
      self2.globalReadBlockList[thisBlock].isOptimized = false;
      self2.globalReadBlockList[thisBlock].itemReference = [];
      self2.globalReadBlockList[thisBlock].itemReference.push(itemList[i]);
    } else {
      outputLog("Attempting optimization of item " + itemList[i].addr + " with " + self2.globalReadBlockList[thisBlock].addr, 0, self2.connectionID);
      self2.globalReadBlockList[thisBlock].byteLength = Math.max(self2.globalReadBlockList[thisBlock].byteLength, itemList[i].offset - self2.globalReadBlockList[thisBlock].offset + itemList[i].byteLength);
      itemList[i].byteBuffer = self2.globalReadBlockList[thisBlock].byteBuffer.slice(itemList[i].offset - self2.globalReadBlockList[thisBlock].offset, itemList[i].offset - self2.globalReadBlockList[thisBlock].offset + itemList[i].byteLength);
      itemList[i].qualityBuffer = self2.globalReadBlockList[thisBlock].qualityBuffer.slice(itemList[i].offset - self2.globalReadBlockList[thisBlock].offset, itemList[i].offset - self2.globalReadBlockList[thisBlock].offset + itemList[i].byteLength);
      self2.globalReadBlockList[thisBlock].isOptimized = true;
      self2.globalReadBlockList[thisBlock].itemReference.push(itemList[i]);
    }
  }
  var thisRequest = 0;
  for (i = 0; i < self2.globalReadBlockList.length; i++) {
    requestList[thisRequest] = self2.globalReadBlockList[i].clone();
    self2.globalReadBlockList[i].parts = Math.ceil(self2.globalReadBlockList[i].byteLength / maxByteRequest);
    outputLog("self.globalReadBlockList " + i + " parts is " + self2.globalReadBlockList[i].parts + " offset is " + self2.globalReadBlockList[i].offset + " MBR is " + maxByteRequest, 1, self2.connectionID);
    var startByte = self2.globalReadBlockList[i].offset;
    var remainingLength = self2.globalReadBlockList[i].byteLength;
    self2.globalReadBlockList[i].requestReference = [];
    for (var j = 0; j < self2.globalReadBlockList[i].parts; j++) {
      requestList[thisRequest] = self2.globalReadBlockList[i].clone();
      self2.globalReadBlockList[i].requestReference.push(requestList[thisRequest]);
      requestList[thisRequest].offset = startByte;
      requestList[thisRequest].byteLength = Math.min(maxByteRequest, remainingLength);
      requestList[thisRequest].byteLengthWithFill = requestList[thisRequest].byteLength;
      if (requestList[thisRequest].byteLengthWithFill % 2) {
        requestList[thisRequest].byteLengthWithFill += 1;
      }
      if (self2.globalReadBlockList[i].parts > 1) {
        requestList[thisRequest].datatype = "BYTE";
        requestList[thisRequest].dtypelen = 1;
        requestList[thisRequest].arrayLength = requestList[thisRequest].byteLength;
      }
      remainingLength -= maxByteRequest;
      thisRequest++;
      startByte += maxByteRequest;
    }
  }
  var requestNumber = 0;
  self2.clearReadPacketTimeouts();
  self2.readPacketArray = [];
  while (requestNumber < requestList.length) {
    var numItems = 0;
    self2.readReqHeader.copy(self2.readReq, 0);
    var packetReplyLength = 12 + 2;
    var packetRequestLength = 12;
    self2.readPacketArray.push(new S7Packet());
    var thisPacketNumber = self2.readPacketArray.length - 1;
    self2.readPacketArray[thisPacketNumber].seqNum = 0;
    self2.readPacketArray[thisPacketNumber].itemList = [];
    for (i = requestNumber; i < requestList.length; i++) {
      if (requestList[i].byteLengthWithFill + 4 + packetReplyLength > self2.maxPDU || packetRequestLength + 12 > self2.maxPDU) {
        outputLog("Splitting request: " + numItems + " items, requestLength would be " + (packetRequestLength + 12) + ", replyLength would be " + (requestList[i].byteLengthWithFill + 4 + packetReplyLength) + ", PDU is " + self2.maxPDU, 1, self2.connectionID);
        if (numItems === 0) {
          outputLog("breaking when we shouldn't, rlibl " + requestList[i].byteLengthWithFill + " MBR " + maxByteRequest, 0, self2.connectionID);
          throw new Error("Somehow write request didn't split properly - exiting.  Report this as a bug.");
        }
        break;
      }
      requestNumber++;
      numItems++;
      packetReplyLength += requestList[i].byteLengthWithFill + 4;
      packetRequestLength += 12;
      self2.readPacketArray[thisPacketNumber].itemList.push(requestList[i]);
    }
  }
  self2.readPacketValid = true;
};
NodeS7.prototype.sendReadPacket = function() {
  var self2 = this, i, j, flagReconnect = false;
  outputLog("SendReadPacket called", 1, self2.connectionID);
  if (!self2.readPacketArray.length && typeof self2.readDoneCallback === "function") {
    self2.readDoneCallback(false, {});
  }
  for (i = 0; i < self2.readPacketArray.length; i++) {
    if (self2.readPacketArray[i].sent) {
      continue;
    }
    if (self2.parallelJobsNow >= self2.maxParallel) {
      continue;
    }
    self2.readPacketArray[i].seqNum = self2.getNextSeqNum();
    self2.readPacketArray[i].reqTime = process.hrtime();
    self2.readReq.writeUInt8(self2.readPacketArray[i].itemList.length, 18);
    self2.readReq.writeUInt16BE(19 + self2.readPacketArray[i].itemList.length * 12, 2);
    self2.readReq.writeUInt16BE(self2.readPacketArray[i].seqNum, 11);
    self2.readReq.writeUInt16BE(self2.readPacketArray[i].itemList.length * 12 + 2, 13);
    for (j = 0; j < self2.readPacketArray[i].itemList.length; j++) {
      S7AddrToBuffer(self2.readPacketArray[i].itemList[j], false).copy(self2.readReq, 19 + j * 12);
    }
    if (self2.isoConnectionState == 4) {
      outputLog("Sending Read Packet With Sequence Number " + self2.readPacketArray[i].seqNum, 1, self2.connectionID);
      self2.readPacketArray[i].timeout = setTimeout(function() {
        self2.packetTimeout.apply(self2, arguments);
      }, self2.globalTimeout, "read", self2.readPacketArray[i].seqNum);
      self2.isoclient.write(self2.readReq.slice(0, 19 + self2.readPacketArray[i].itemList.length * 12));
      self2.readPacketArray[i].sent = true;
      self2.readPacketArray[i].rcvd = false;
      self2.readPacketArray[i].timeoutError = false;
      self2.parallelJobsNow += 1;
    } else {
      self2.readPacketArray[i].sent = true;
      self2.readPacketArray[i].rcvd = false;
      self2.readPacketArray[i].timeoutError = true;
      if (!flagReconnect) {
        outputLog("Not Sending Read Packet because we are not connected - ISO CS is " + self2.isoConnectionState, 0, self2.connectionID);
      }
      if (self2.isoConnectionState === 0) {
        flagReconnect = true;
      }
      outputLog("Requesting PacketTimeout Due to ISO CS NOT 4 - READ SN " + self2.readPacketArray[i].seqNum, 1, self2.connectionID);
      self2.readPacketArray[i].timeout = setTimeout(function() {
        self2.packetTimeout.apply(self2, arguments);
      }, 0, "read", self2.readPacketArray[i].seqNum);
    }
  }
};
NodeS7.prototype.sendWritePacket = function() {
  var self2 = this, i, dataBuffer, itemBuffer, dataBufferPointer;
  dataBuffer = Buffer.alloc(8192);
  self2.writeInQueue = false;
  for (i = 0; i < self2.writePacketArray.length; i++) {
    if (self2.writePacketArray[i].sent) {
      continue;
    }
    if (self2.parallelJobsNow >= self2.maxParallel) {
      continue;
    }
    self2.writePacketArray[i].reqTime = process.hrtime();
    self2.writeReq.writeUInt8(self2.writePacketArray[i].itemList.length, 18);
    self2.writeReq.writeUInt16BE(self2.writePacketArray[i].seqNum, 11);
    dataBufferPointer = 0;
    for (var j = 0; j < self2.writePacketArray[i].itemList.length; j++) {
      S7AddrToBuffer(self2.writePacketArray[i].itemList[j], true).copy(self2.writeReq, 19 + j * 12);
      itemBuffer = getWriteBuffer(self2.writePacketArray[i].itemList[j]);
      itemBuffer.copy(dataBuffer, dataBufferPointer);
      dataBufferPointer += itemBuffer.length;
      if (j < self2.writePacketArray[i].itemList.length - 1) {
        if (itemBuffer.length % 2) {
          dataBufferPointer += 1;
        }
      }
    }
    self2.writeReq.writeUInt16BE(19 + self2.writePacketArray[i].itemList.length * 12 + dataBufferPointer, 2);
    self2.writeReq.writeUInt16BE(self2.writePacketArray[i].itemList.length * 12 + 2, 13);
    self2.writeReq.writeUInt16BE(dataBufferPointer, 15);
    dataBuffer.copy(self2.writeReq, 19 + self2.writePacketArray[i].itemList.length * 12, 0, dataBufferPointer);
    if (self2.isoConnectionState === 4) {
      self2.writePacketArray[i].timeout = setTimeout(function() {
        self2.packetTimeout.apply(self2, arguments);
      }, self2.globalTimeout, "write", self2.writePacketArray[i].seqNum);
      self2.isoclient.write(self2.writeReq.slice(0, 19 + dataBufferPointer + self2.writePacketArray[i].itemList.length * 12));
      self2.writePacketArray[i].sent = true;
      self2.writePacketArray[i].rcvd = false;
      self2.writePacketArray[i].timeoutError = false;
      self2.parallelJobsNow += 1;
      outputLog("Sending Write Packet With Sequence Number " + self2.writePacketArray[i].seqNum, 1, self2.connectionID);
    } else {
      self2.writePacketArray[i].sent = true;
      self2.writePacketArray[i].rcvd = false;
      self2.writePacketArray[i].timeoutError = true;
      self2.writePacketArray[i].timeout = setTimeout(function() {
        self2.packetTimeout.apply(self2, arguments);
      }, 0, "write", self2.writePacketArray[i].seqNum);
      if (self2.isoConnectionState === 0) ;
    }
  }
};
NodeS7.prototype.isOptimizableArea = function(area) {
  var self2 = this;
  if (self2.doNotOptimize) {
    return false;
  }
  switch (area) {
    case 132:
    case 129:
    case 130:
    case 131:
      return true;
    default:
      return false;
  }
};
NodeS7.prototype.onResponse = function(theData) {
  var self2 = this;
  if (!(theData && theData.length > 6)) {
    outputLog("INVALID READ RESPONSE - DISCONNECTING");
    outputLog("The incoming packet doesn't have the required minimum length of 7 bytes");
    outputLog(theData);
    self2.connectionReset();
    return;
  }
  var data = checkRFCData(theData);
  if (data === "fastACK") {
    outputLog("Fast Acknowledge received.", 0, self2.connectionID);
    self2.isoclient.removeAllListeners("error");
    self2.isoclient.removeAllListeners("data");
    self2.isoclient.on("data", function() {
      self2.onResponse.apply(self2, arguments);
    });
    self2.isoclient.on("error", function() {
      self2.readWriteError.apply(self2, arguments);
    });
  } else if (data[7] === 50) {
    if (data.length > 8 && data[8] != 3) {
      outputLog("PDU type (byte 8) was returned as " + data[8] + " where the response PDU of 3 was expected.");
      outputLog("Maybe you are requesting more than 240 bytes of data in a packet?");
      outputLog(data);
      self2.connectionReset();
      return null;
    }
    if (data.length > data.readInt16BE(2)) {
      outputLog("An oversize packet was detected.  Excess length is " + (data.length - data.readInt16BE(2)) + ".  ");
      outputLog("We assume this is because two packets were sent at nearly the same time by the PLC.");
      outputLog("We are slicing the buffer and scheduling the second half for further processing next loop.");
      setTimeout(function() {
        self2.onResponse.apply(self2, arguments);
      }, 0, data.slice(data.readInt16BE(2)));
    }
    if (data.length < data.readInt16BE(2) || data.readInt16BE(2) < 22 || data[5] !== 240 || data[4] + 1 + 12 + 4 + data.readInt16BE(13) + data.readInt16BE(15) !== data.readInt16BE(2) || !(data[6] >> 7) || data[7] !== 50 || data[8] !== 3) {
      outputLog("INVALID READ RESPONSE - DISCONNECTING");
      outputLog("TPKT Length From Header is " + data.readInt16BE(2) + " and RCV buffer length is " + data.length + " and COTP length is " + data.readUInt8(4) + " and data[6] is " + data[6]);
      outputLog(data);
      self2.connectionReset();
      return null;
    }
    outputLog("Received " + data.readUInt16BE(15) + " bytes of S7-data from PLC.  Sequence number is " + data.readUInt16BE(11), 1, self2.connectionID);
    var foundSeqNum;
    var isReadResponse, isWriteResponse;
    foundSeqNum = self2.findReadIndexOfSeqNum(data.readUInt16BE(11));
    if (foundSeqNum === void 0) {
      foundSeqNum = self2.findWriteIndexOfSeqNum(data.readUInt16BE(11));
      if (foundSeqNum !== void 0) {
        self2.writeResponse(data, foundSeqNum);
        isWriteResponse = true;
      }
    } else {
      isReadResponse = true;
      self2.readResponse(data, foundSeqNum);
    }
    if (!isReadResponse && !isWriteResponse) {
      outputLog("Sequence number that arrived wasn't a write reply either - dropping");
      outputLog(data);
      return null;
    }
  } else {
    outputLog("INVALID READ RESPONSE - DISCONNECTING");
    outputLog("TPKT Length From Header is " + theData.readInt16BE(2) + " and RCV buffer length is " + theData.length + " and COTP length is " + theData.readUInt8(4) + " and data[6] is " + theData[6]);
    outputLog(theData);
    self2.connectionReset();
    return null;
  }
};
NodeS7.prototype.findReadIndexOfSeqNum = function(seqNum) {
  var self2 = this, packetCounter;
  for (packetCounter = 0; packetCounter < self2.readPacketArray.length; packetCounter++) {
    if (self2.readPacketArray[packetCounter].seqNum == seqNum) {
      return packetCounter;
    }
  }
  return void 0;
};
NodeS7.prototype.findWriteIndexOfSeqNum = function(seqNum) {
  var self2 = this, packetCounter;
  for (packetCounter = 0; packetCounter < self2.writePacketArray.length; packetCounter++) {
    if (self2.writePacketArray[packetCounter].seqNum == seqNum) {
      return packetCounter;
    }
  }
  return void 0;
};
NodeS7.prototype.writeResponse = function(data, foundSeqNum) {
  var self2 = this, dataPointer = 21, i, anyBadQualities;
  for (var itemCount = 0; itemCount < self2.writePacketArray[foundSeqNum].itemList.length; itemCount++) {
    dataPointer = processS7WriteItem(data, self2.writePacketArray[foundSeqNum].itemList[itemCount], dataPointer);
    if (!dataPointer) {
      outputLog("Stopping Processing Write Response Packet due to unrecoverable packet error");
      break;
    }
  }
  self2.writePacketArray[foundSeqNum].reqTime = process.hrtime(self2.writePacketArray[foundSeqNum].reqTime);
  outputLog("Time is " + self2.writePacketArray[foundSeqNum].reqTime[0] + " seconds and " + Math.round(self2.writePacketArray[foundSeqNum].reqTime[1] * 10 / 1e6) / 10 + " ms.", 1, self2.connectionID);
  if (!self2.writePacketArray[foundSeqNum].rcvd) {
    self2.writePacketArray[foundSeqNum].rcvd = true;
    self2.parallelJobsNow--;
  }
  clearTimeout(self2.writePacketArray[foundSeqNum].timeout);
  if (!self2.writePacketArray.every(doneSending)) {
    outputLog("Not done sending - sending more packets from writeResponse", 1, self2.connectionID);
    self2.sendWritePacket();
  } else {
    outputLog("Received all packets in writeResponse", 1, self2.connectionID);
    for (i = 0; i < self2.writePacketArray.length; i++) {
      self2.writePacketArray[i].sent = false;
      self2.writePacketArray[i].rcvd = false;
    }
    anyBadQualities = false;
    for (i = 0; i < self2.globalWriteBlockList.length; i++) {
      writePostProcess(self2.globalWriteBlockList[i]);
      for (var k = 0; k < self2.globalWriteBlockList[i].itemReference.length; k++) {
        outputLog(self2.globalWriteBlockList[i].itemReference[k].addr + " write completed with quality " + self2.globalWriteBlockList[i].itemReference[k].writeQuality, 0, self2.connectionID);
        if (!isQualityOK(self2.globalWriteBlockList[i].itemReference[k].writeQuality)) {
          anyBadQualities = true;
        }
      }
      if (!isQualityOK(self2.globalWriteBlockList[i].writeQuality)) {
        anyBadQualities = true;
      }
    }
    if (self2.resetPending) {
      outputLog("Calling reset from writeResponse as there is one pending", 0, self2.connectionID);
      self2.resetNow();
    }
    if (self2.isoConnectionState === 0) {
      self2.connectNow(self2.connectionParams, false);
    }
    outputLog("We are calling back our writeDoneCallback.", 1, self2.connectionID);
    if (typeof self2.writeDoneCallback === "function") {
      self2.writeDoneCallback(anyBadQualities);
    }
  }
};
function doneSending(element) {
  return element.sent && element.rcvd ? true : false;
}
NodeS7.prototype.readResponse = function(data, foundSeqNum) {
  var self2 = this, i;
  var anyBadQualities;
  var dataPointer = 21;
  var dataObject = {};
  outputLog("ReadResponse called", 1, self2.connectionID);
  if (!self2.readPacketArray[foundSeqNum].sent) {
    outputLog("WARNING: Received a read response packet that was not marked as sent", 0, self2.connectionID);
    return null;
  }
  if (self2.readPacketArray[foundSeqNum].rcvd) {
    outputLog("WARNING: Received a read response packet that was already marked as received", 0, self2.connectionID);
    return null;
  }
  for (var itemCount = 0; itemCount < self2.readPacketArray[foundSeqNum].itemList.length; itemCount++) {
    dataPointer = processS7Packet(data, self2.readPacketArray[foundSeqNum].itemList[itemCount], dataPointer, self2.connectionID);
    if (!dataPointer) {
      outputLog("Received a ZERO RESPONSE Processing Read Packet due to unrecoverable packet error", 0, self2.connectionID);
    }
  }
  self2.readPacketArray[foundSeqNum].reqTime = process.hrtime(self2.readPacketArray[foundSeqNum].reqTime);
  outputLog("Time is " + self2.readPacketArray[foundSeqNum].reqTime[0] + " seconds and " + Math.round(self2.readPacketArray[foundSeqNum].reqTime[1] * 10 / 1e6) / 10 + " ms.", 1, self2.connectionID);
  if (!self2.readPacketArray[foundSeqNum].rcvd) {
    self2.readPacketArray[foundSeqNum].rcvd = true;
    self2.parallelJobsNow--;
  }
  clearTimeout(self2.readPacketArray[foundSeqNum].timeout);
  if (self2.readPacketArray.every(doneSending)) {
    for (i = 0; i < self2.readPacketArray.length; i++) {
      self2.readPacketArray[i].sent = false;
      self2.readPacketArray[i].rcvd = false;
    }
    anyBadQualities = false;
    for (i = 0; i < self2.globalReadBlockList.length; i++) {
      var lengthOffset = 0;
      for (var j = 0; j < self2.globalReadBlockList[i].requestReference.length; j++) {
        self2.globalReadBlockList[i].requestReference[j].byteBuffer.copy(self2.globalReadBlockList[i].byteBuffer, lengthOffset, 0, self2.globalReadBlockList[i].requestReference[j].byteLength);
        self2.globalReadBlockList[i].requestReference[j].qualityBuffer.copy(self2.globalReadBlockList[i].qualityBuffer, lengthOffset, 0, self2.globalReadBlockList[i].requestReference[j].byteLength);
        lengthOffset += self2.globalReadBlockList[i].requestReference[j].byteLength;
      }
      for (var k = 0; k < self2.globalReadBlockList[i].itemReference.length; k++) {
        processS7ReadItem(self2.globalReadBlockList[i].itemReference[k]);
        outputLog("Address " + self2.globalReadBlockList[i].itemReference[k].addr + " has value " + self2.globalReadBlockList[i].itemReference[k].value + " and quality " + self2.globalReadBlockList[i].itemReference[k].quality, 1, self2.connectionID);
        if (!isQualityOK(self2.globalReadBlockList[i].itemReference[k].quality)) {
          anyBadQualities = true;
          dataObject[self2.globalReadBlockList[i].itemReference[k].useraddr] = self2.globalReadBlockList[i].itemReference[k].quality;
        } else {
          dataObject[self2.globalReadBlockList[i].itemReference[k].useraddr] = self2.globalReadBlockList[i].itemReference[k].value;
        }
      }
    }
    if (!self2.writeInQueue) {
      if (self2.resetPending) {
        outputLog("Calling reset from readResponse as there is one pending", 0, self2.connectionID);
        self2.resetNow();
      }
      if (self2.isoConnectionState === 0) {
        self2.connectNow(self2.connectionParams, false);
      }
    } else {
      outputLog("Write In Queue.  ICS " + self2.isoConnectionState + " resetPending " + self2.resetPending, 1, self2.connectionID);
    }
    outputLog("We are calling back our readDoneCallback.", 1, self2.connectionID);
    if (typeof self2.readDoneCallback === "function") {
      self2.readDoneCallback(anyBadQualities, dataObject);
    }
    if (!self2.isReading() && self2.writeInQueue) {
      outputLog("SendWritePacket called because write was queued.", 0, self2.connectionID);
      self2.sendWritePacket();
    }
  } else {
    self2.sendReadPacket();
  }
};
NodeS7.prototype.onClientDisconnect = function() {
  var self2 = this;
  outputLog("ISO-on-TCP connection DISCONNECTED.", 0, self2.connectionID);
  if (!self2.connectCBIssued && typeof self2.connectCallback === "function") {
    self2.connectCBIssued = true;
    self2.connectCallback("Error - TCP connected, ISO didn't");
  }
  self2.connectionReset();
};
NodeS7.prototype.onClientClose = function() {
  var self2 = this;
  self2.connectionReset();
  if (self2.dropConnectionCallback) {
    self2.dropConnectionCallback();
    self2.dropConnectionCallback = null;
    clearTimeout(self2.dropConnectionTimer);
  }
};
NodeS7.prototype.connectionReset = function() {
  var self2 = this;
  self2.isoConnectionState = 0;
  self2.resetPending = true;
  outputLog("ConnectionReset has been called to set the reset as pending", 0, self2.connectionID);
  if (!self2.isReading() && !self2.isWriting() && !self2.writeInQueue && typeof self2.resetTimeout === "undefined") {
    self2.resetTimeout = setTimeout(function() {
      outputLog("Timed reset has happened. Ideally this would never be called as reset should be completed when done r/w.", 0, self2.connectionID);
      self2.resetNow.apply(self2, arguments);
    }, 3500);
  }
};
NodeS7.prototype.resetNow = function() {
  var self2 = this;
  self2.isoConnectionState = 0;
  self2.isoclient.end();
  outputLog("ResetNOW is happening", 0, self2.connectionID);
  self2.resetPending = false;
  if (typeof self2.resetTimeout !== "undefined") {
    clearTimeout(self2.resetTimeout);
    self2.resetTimeout = void 0;
    outputLog("Clearing an earlier scheduled reset", 0, self2.connectionID);
  }
};
NodeS7.prototype.connectionCleanup = function() {
  var self2 = this;
  self2.isoConnectionState = 0;
  outputLog("Connection cleanup is happening", 0, self2.connectionID);
  if (typeof self2.isoclient !== "undefined") {
    self2.isoclient.destroy();
    self2.isoclient.removeAllListeners("data");
    self2.isoclient.removeAllListeners("error");
    self2.isoclient.removeAllListeners("connect");
    self2.isoclient.removeAllListeners("end");
    self2.isoclient.removeAllListeners("close");
    self2.isoclient.on("error", function() {
      outputLog("TCP socket error following connection cleanup");
    });
  }
  clearTimeout(self2.connectTimeout);
  clearTimeout(self2.PDUTimeout);
  self2.clearReadPacketTimeouts();
  self2.clearWritePacketTimeouts();
};
function checkRFCData(data) {
  var ret = null;
  var RFC_Version = data[0];
  var TPKT_Length = data.readInt16BE(2);
  var TPDU_Code = data[5];
  var LastDataUnit = data[6];
  if (RFC_Version !== 3 && TPDU_Code !== 240) {
    return "error";
  } else if (LastDataUnit >> 7 === 0 && TPKT_Length == data.length && data.length === 7) {
    ret = "fastACK";
  } else if (LastDataUnit >> 7 == 1 && TPKT_Length <= data.length) {
    ret = data;
  } else if (LastDataUnit >> 7 == 0 && TPKT_Length !== data.length) {
    ret = data.slice(7, data.length);
  } else {
    ret = "error";
  }
  return ret;
}
function S7AddrToBuffer(addrinfo, isWriting) {
  var thisBitOffset = 0, theReq = Buffer.from([18, 10, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  theReq[3] = 2;
  if (addrinfo.datatype === "X") {
    theReq.writeUInt16BE(addrinfo.byteLength, 4);
    if (isWriting && addrinfo.arrayLength === 1) {
      theReq[3] = 1;
      thisBitOffset = addrinfo.bitOffset;
    }
  } else if (addrinfo.datatype === "TIMER" || addrinfo.datatype === "COUNTER") {
    theReq.writeUInt16BE(1, 4);
    theReq.writeUInt8(addrinfo.areaS7Code, 3);
  } else {
    theReq.writeUInt16BE(addrinfo.byteLength, 4);
  }
  theReq.writeUInt16BE(addrinfo.dbNumber, 6);
  theReq.writeUInt32BE(addrinfo.offset * 8 + thisBitOffset, 8);
  theReq[8] |= addrinfo.areaS7Code;
  return theReq;
}
function processS7Packet(theData, theItem, thePointer, theCID) {
  var remainingLength;
  if (typeof theData === "undefined") {
    remainingLength = 0;
    outputLog("Processing an undefined packet, likely due to timeout error", 0, theCID);
  } else if (isNaN(theItem.byteLength)) {
    outputLog("Processing an undefined packet, perhaps bad input?", 0, theCID);
    return 0;
  } else {
    remainingLength = theData.length - thePointer;
  }
  var prePointer = thePointer;
  theItem.qualityBuffer = Buffer.alloc(theItem.byteLength);
  theItem.qualityBuffer.fill(255);
  if (remainingLength < 4) {
    theItem.valid = false;
    if (typeof theData !== "undefined") {
      theItem.errCode = "Malformed Packet - Less Than 4 Bytes.  TDL" + theData.length + "TP" + thePointer + "RL" + remainingLength;
    } else {
      theItem.errCode = "Timeout error - zero length packet";
    }
    outputLog(theItem.errCode, 0, theCID);
    return 0;
  }
  var reportedDataLength;
  if (theItem.readTransportCode == 4) {
    reportedDataLength = theData.readUInt16BE(thePointer + 2) / 8;
  } else {
    reportedDataLength = theData.readUInt16BE(thePointer + 2);
  }
  var responseCode = theData[thePointer];
  var transportCode = theData[thePointer + 1];
  if (remainingLength == reportedDataLength + 2) {
    outputLog("Not last part.", 0, theCID);
  }
  if (remainingLength < reportedDataLength + 2) {
    theItem.valid = false;
    theItem.errCode = "Malformed Packet - Item Data Length and Packet Length Disagree.  RDL+2 " + (reportedDataLength + 2) + " remainingLength " + remainingLength;
    outputLog(theItem.errCode, 0, theCID);
    return 0;
  }
  if (responseCode !== 255) {
    theItem.valid = false;
    theItem.errCode = "Invalid Response Code - " + responseCode;
    outputLog(theItem.errCode, 0, theCID);
    return thePointer + reportedDataLength + 4;
  }
  if (transportCode !== theItem.readTransportCode) {
    theItem.valid = false;
    theItem.errCode = "Invalid Transport Code - " + transportCode;
    outputLog(theItem.errCode, 0, theCID);
    return thePointer + reportedDataLength + 4;
  }
  var expectedLength = theItem.byteLength;
  if (reportedDataLength !== expectedLength) {
    theItem.valid = false;
    theItem.errCode = "Invalid Response Length - Expected " + expectedLength + " but got " + reportedDataLength + " bytes.";
    outputLog(theItem.errCode, 0, theCID);
    return reportedDataLength + 2;
  }
  thePointer += 4;
  theItem.valid = true;
  theItem.byteBuffer = theData.slice(thePointer, thePointer + reportedDataLength);
  theItem.qualityBuffer.fill(192);
  thePointer += theItem.byteLength;
  if ((thePointer - prePointer) % 2) {
    thePointer += 1;
  }
  return thePointer;
}
function processS7WriteItem(theData, theItem, thePointer) {
  var remainingLength;
  if (!theData) {
    theItem.writeQualityBuffer.fill(255);
    theItem.valid = false;
    theItem.errCode = "We must have timed Out - we have no response to process";
    outputLog(theItem.errCode);
    return 0;
  }
  remainingLength = theData.length - thePointer;
  if (remainingLength < 1) {
    theItem.writeQualityBuffer.fill(255);
    theItem.valid = false;
    theItem.errCode = "Malformed Packet - Less Than 1 Byte.  TDL " + theData.length + " TP" + thePointer + " RL" + remainingLength;
    outputLog(theItem.errCode);
    return 0;
  }
  var writeResponse = theData.readUInt8(thePointer);
  theItem.writeResponse = writeResponse;
  if (writeResponse !== 255) {
    outputLog("Received write error of " + theItem.writeResponse + " on " + theItem.addr);
    theItem.writeQualityBuffer.fill(255);
  } else {
    theItem.writeQualityBuffer.fill(192);
  }
  return thePointer + 1;
}
function writePostProcess(theItem) {
  var thePointer = 0;
  if (theItem.arrayLength === 1) {
    if (theItem.writeQualityBuffer[0] === 255) {
      theItem.writeQuality = "BAD";
    } else {
      theItem.writeQuality = "OK";
    }
  } else {
    theItem.writeQuality = [];
    for (var arrayIndex = 0; arrayIndex < theItem.arrayLength; arrayIndex++) {
      if (theItem.writeQualityBuffer[thePointer] === 255) {
        theItem.writeQuality[arrayIndex] = "BAD";
      } else {
        theItem.writeQuality[arrayIndex] = "OK";
      }
      if (theItem.datatype == "X") {
        if ((arrayIndex + theItem.bitOffset + 1) % 8 === 0 || arrayIndex == theItem.arrayLength - 1) {
          thePointer += theItem.dtypelen;
        }
      } else {
        thePointer += theItem.dtypelen;
      }
    }
  }
}
function fromBCD(n) {
  return (n >> 4) * 10 + (n & 15);
}
function toBCD(n) {
  return n / 10 << 4 | n % 10;
}
function readDT(buffer, offset, isUTC) {
  let year = fromBCD(buffer.readUInt8(offset));
  let month = fromBCD(buffer.readUInt8(offset + 1));
  let day = fromBCD(buffer.readUInt8(offset + 2));
  let hour = fromBCD(buffer.readUInt8(offset + 3));
  let min = fromBCD(buffer.readUInt8(offset + 4));
  let sec = fromBCD(buffer.readUInt8(offset + 5));
  let ms_1 = fromBCD(buffer.readUInt8(offset + 6));
  let ms_2 = fromBCD(buffer.readUInt8(offset + 7) & 240);
  let date;
  if (isUTC) {
    date = new Date(Date.UTC(
      (year > 89 ? 1900 : 2e3) + year,
      month - 1,
      day,
      hour,
      min,
      sec,
      ms_1 * 10 + ms_2 / 10
    ));
  } else {
    date = new Date(
      (year > 89 ? 1900 : 2e3) + year,
      month - 1,
      day,
      hour,
      min,
      sec,
      ms_1 * 10 + ms_2 / 10
    );
  }
  return date;
}
function writeDT(date, buffer, offset, isUTC) {
  if (!(date instanceof Date)) {
    if (date > 631152e6 && date < 3786911999999) {
      date = new Date(date);
    } else {
      outputLog("Unsupported value of [" + date + "] for writing data of type DATE_AND_TIME. Skipping item");
      return;
    }
  }
  if (isUTC) {
    buffer.writeUInt8(toBCD(date.getUTCFullYear() % 100), offset);
    buffer.writeUInt8(toBCD(date.getUTCMonth() + 1), offset + 1);
    buffer.writeUInt8(toBCD(date.getUTCDate()), offset + 2);
    buffer.writeUInt8(toBCD(date.getUTCHours()), offset + 3);
    buffer.writeUInt8(toBCD(date.getUTCMinutes()), offset + 4);
    buffer.writeUInt8(toBCD(date.getUTCSeconds()), offset + 5);
    buffer.writeUInt8(toBCD(date.getUTCMilliseconds() / 10 >> 0), offset + 6);
    buffer.writeUInt8(toBCD(date.getUTCMilliseconds() % 10 * 10 + (date.getUTCDay() + 1)), offset + 7);
  } else {
    buffer.writeUInt8(toBCD(date.getFullYear() % 100), offset);
    buffer.writeUInt8(toBCD(date.getMonth() + 1), offset + 1);
    buffer.writeUInt8(toBCD(date.getDate()), offset + 2);
    buffer.writeUInt8(toBCD(date.getHours()), offset + 3);
    buffer.writeUInt8(toBCD(date.getMinutes()), offset + 4);
    buffer.writeUInt8(toBCD(date.getSeconds()), offset + 5);
    buffer.writeUInt8(toBCD(date.getMilliseconds() / 10 >> 0), offset + 6);
    buffer.writeUInt8(toBCD(date.getMilliseconds() % 10 * 10 + (date.getDay() + 1)), offset + 7);
  }
}
function readDTL(buffer, offset, isUTC) {
  let year = buffer.readUInt16BE(offset);
  let month = buffer.readUInt8(offset + 2);
  let day = buffer.readUInt8(offset + 3);
  let hour = buffer.readUInt8(offset + 5);
  let min = buffer.readUInt8(offset + 6);
  let sec = buffer.readUInt8(offset + 7);
  let ns = buffer.readUInt32BE(offset + 8);
  let date;
  if (isUTC) {
    date = new Date(Date.UTC(
      year,
      month - 1,
      day,
      hour,
      min,
      sec,
      ns / 1e6
    ));
  } else {
    date = new Date(
      year,
      month - 1,
      day,
      hour,
      min,
      sec,
      ns / 1e6
    );
  }
  return date;
}
function writeDTL(date, buffer, offset, isUTC) {
  if (!(date instanceof Date)) {
    if (date >= 0 && date < 9223382836854) {
      date = new Date(date);
    } else {
      outputLog("Unsupported value of [" + date + "] for writing data of type DATE_AND_TIME. Skipping item");
      return;
    }
  }
  if (isUTC) {
    buffer.writeUInt16BE(date.getUTCFullYear(), offset);
    buffer.writeUInt8(date.getUTCMonth() + 1, offset + 2);
    buffer.writeUInt8(date.getUTCDate(), offset + 3);
    buffer.writeUInt8(date.getUTCDay() + 1, offset + 4);
    buffer.writeUInt8(date.getUTCHours(), offset + 5);
    buffer.writeUInt8(date.getUTCMinutes(), offset + 6);
    buffer.writeUInt8(date.getUTCSeconds(), offset + 7);
    buffer.writeUInt32BE(date.getUTCMilliseconds() * 1e6, offset + 8);
  } else {
    buffer.writeUInt16BE(date.getFullYear(), offset);
    buffer.writeUInt8(date.getMonth() + 1, offset + 2);
    buffer.writeUInt8(date.getDate(), offset + 3);
    buffer.writeUInt8(date.getDay() + 1, offset + 4);
    buffer.writeUInt8(date.getHours(), offset + 5);
    buffer.writeUInt8(date.getMinutes(), offset + 6);
    buffer.writeUInt8(date.getSeconds(), offset + 7);
    buffer.writeUInt32BE(date.getMilliseconds() * 1e6, offset + 8);
  }
}
function processS7ReadItem(theItem) {
  var thePointer = 0;
  var strlen = 0;
  var tempString = "";
  if (theItem.arrayLength > 1) {
    if (theItem.datatype != "C" && theItem.datatype != "CHAR") {
      theItem.value = [];
      theItem.quality = [];
    } else {
      theItem.value = "";
      theItem.quality = "";
    }
    var bitShiftAmount = theItem.bitOffset;
    for (var arrayIndex = 0; arrayIndex < theItem.arrayLength; arrayIndex++) {
      if (theItem.qualityBuffer[thePointer] !== 192) {
        if (theItem.quality instanceof Array) {
          theItem.value.push(theItem.badValue());
          theItem.quality.push("BAD " + theItem.qualityBuffer[thePointer]);
        } else {
          theItem.value = theItem.badValue();
          theItem.quality = "BAD " + theItem.qualityBuffer[thePointer];
        }
      } else {
        if (theItem.quality instanceof Array) {
          theItem.quality.push("OK");
        } else {
          theItem.quality = "OK";
        }
        switch (theItem.datatype) {
          case "DT":
            theItem.value.push(readDT(theItem.byteBuffer, thePointer, false));
            break;
          case "DTZ":
            theItem.value.push(readDT(theItem.byteBuffer, thePointer, true));
            break;
          case "DTL":
            theItem.value.push(readDTL(theItem.byteBuffer, thePointer, false));
            break;
          case "DTLZ":
            theItem.value.push(readDTL(theItem.byteBuffer, thePointer, true));
            break;
          case "REAL":
            theItem.value.push(theItem.byteBuffer.readFloatBE(thePointer));
            break;
          case "LREAL":
            theItem.value.push(theItem.byteBuffer.readDoubleBE(thePointer));
            break;
          case "LINT":
            break;
          case "DWORD":
            theItem.value.push(theItem.byteBuffer.readUInt32BE(thePointer));
            break;
          case "DINT":
            theItem.value.push(theItem.byteBuffer.readInt32BE(thePointer));
            break;
          case "INT":
            theItem.value.push(theItem.byteBuffer.readInt16BE(thePointer));
            break;
          case "WORD":
            theItem.value.push(theItem.byteBuffer.readUInt16BE(thePointer));
            break;
          case "X":
            theItem.value.push(theItem.byteBuffer.readUInt8(thePointer) >> bitShiftAmount & 1 ? true : false);
            break;
          case "B":
          case "BYTE":
            theItem.value.push(theItem.byteBuffer.readUInt8(thePointer));
            break;
          case "S":
          case "STRING":
            strlen = theItem.byteBuffer.readUInt8(thePointer + 1);
            tempString = "";
            for (var charOffset = 2; charOffset < theItem.dtypelen && charOffset - 2 < strlen; charOffset++) {
              tempString += String.fromCharCode(theItem.byteBuffer.readUInt8(thePointer + charOffset));
            }
            theItem.value.push(tempString);
            break;
          case "C":
          case "CHAR":
            theItem.value += String.fromCharCode(theItem.byteBuffer.readUInt8(thePointer));
            break;
          case "TIMER":
          case "COUNTER":
            theItem.value.push(theItem.byteBuffer.readInt16BE(thePointer));
            break;
          default:
            outputLog("Unknown data type in response - should never happen.  Should have been caught earlier.  " + theItem.datatype);
            return 0;
        }
      }
      if (theItem.datatype == "X") {
        bitShiftAmount++;
        if ((arrayIndex + theItem.bitOffset + 1) % 8 === 0 || arrayIndex == theItem.arrayLength - 1) {
          thePointer += theItem.dtypelen;
          bitShiftAmount = 0;
        }
      } else {
        thePointer += theItem.dtypelen;
      }
    }
  } else {
    if (theItem.qualityBuffer[thePointer] !== 192) {
      theItem.value = theItem.badValue();
      theItem.quality = "BAD " + theItem.qualityBuffer[thePointer];
    } else {
      theItem.quality = "OK";
      switch (theItem.datatype) {
        case "DT":
          theItem.value = readDT(theItem.byteBuffer, thePointer, false);
          break;
        case "DTZ":
          theItem.value = readDT(theItem.byteBuffer, thePointer, true);
          break;
        case "DTL":
          theItem.value = readDTL(theItem.byteBuffer, thePointer, false);
          break;
        case "DTLZ":
          theItem.value = readDTL(theItem.byteBuffer, thePointer, true);
          break;
        case "REAL":
          theItem.value = theItem.byteBuffer.readFloatBE(thePointer);
          break;
        case "LREAL":
          theItem.value = theItem.byteBuffer.readDoubleBE(thePointer);
          break;
        case "LINT":
          break;
        case "DWORD":
          theItem.value = theItem.byteBuffer.readUInt32BE(thePointer);
          break;
        case "DINT":
          theItem.value = theItem.byteBuffer.readInt32BE(thePointer);
          break;
        case "INT":
          theItem.value = theItem.byteBuffer.readInt16BE(thePointer);
          break;
        case "WORD":
          theItem.value = theItem.byteBuffer.readUInt16BE(thePointer);
          break;
        case "X":
          theItem.value = theItem.byteBuffer.readUInt8(thePointer) >> theItem.bitOffset & 1 ? true : false;
          break;
        case "B":
        case "BYTE":
          theItem.value = theItem.byteBuffer.readUInt8(thePointer);
          break;
        case "S":
        case "STRING":
          strlen = theItem.byteBuffer.readUInt8(thePointer + 1);
          theItem.value = "";
          for (var charOffset = 2; charOffset < theItem.dtypelen && charOffset - 2 < strlen; charOffset++) {
            theItem.value += String.fromCharCode(theItem.byteBuffer.readUInt8(thePointer + charOffset));
          }
          break;
        case "C":
        case "CHAR":
          theItem.value = String.fromCharCode(theItem.byteBuffer.readUInt8(thePointer));
          break;
        case "TIMER":
        case "COUNTER":
          theItem.value = theItem.byteBuffer.readInt16BE(thePointer);
          break;
        default:
          outputLog("Unknown data type in response - should never happen.  Should have been caught earlier.  " + theItem.datatype);
          return 0;
      }
    }
    thePointer += theItem.dtypelen;
  }
  if (thePointer % 2) {
    thePointer += 1;
  }
  return thePointer;
}
function getWriteBuffer(theItem) {
  var newBuffer;
  if (theItem.datatype === "X" && theItem.arrayLength === 1) {
    newBuffer = Buffer.alloc(2 + 3);
    newBuffer.fill(0);
    newBuffer.writeUInt16BE(1, 2);
  } else {
    newBuffer = Buffer.alloc(theItem.byteLength + 4);
    newBuffer.fill(0);
    newBuffer.writeUInt16BE(theItem.byteLength * 8, 2);
  }
  if (theItem.writeBuffer.length < theItem.byteLengthWithFill) {
    outputLog("Attempted to access part of the write buffer that wasn't there when writing an item.");
  }
  newBuffer[0] = 0;
  newBuffer[1] = theItem.writeTransportCode;
  theItem.writeBuffer.copy(newBuffer, 4, 0, theItem.byteLength);
  return newBuffer;
}
function bufferizeS7Item(theItem) {
  var thePointer, theByte;
  theByte = 0;
  thePointer = 0;
  if (theItem.arrayLength > 1) {
    var bitShiftAmount = theItem.bitOffset;
    for (var arrayIndex = 0; arrayIndex < theItem.arrayLength; arrayIndex++) {
      switch (theItem.datatype) {
        case "DT":
          writeDT(theItem.writeValue[arrayIndex], theItem.writeBuffer, thePointer, false);
          break;
        case "DTZ":
          writeDT(theItem.writeValue[arrayIndex], theItem.writeBuffer, thePointer, true);
          break;
        case "DTL":
          writeDTL(theItem.writeValue[arrayIndex], theItem.writeBuffer, thePointer, false);
          break;
        case "DTLZ":
          writeDTL(theItem.writeValue[arrayIndex], theItem.writeBuffer, thePointer, true);
          break;
        case "REAL":
          theItem.writeBuffer.writeFloatBE(theItem.writeValue[arrayIndex], thePointer);
          break;
        case "LREAL":
          theItem.writeBuffer.writeDoubleBE(theItem.writeValue[arrayIndex], thePointer);
          break;
        case "LINT":
          break;
        case "DWORD":
          theItem.writeBuffer.writeInt32BE(theItem.writeValue[arrayIndex], thePointer);
          break;
        case "DINT":
          theItem.writeBuffer.writeInt32BE(theItem.writeValue[arrayIndex], thePointer);
          break;
        case "INT":
          theItem.writeBuffer.writeInt16BE(theItem.writeValue[arrayIndex], thePointer);
          break;
        case "WORD":
          theItem.writeBuffer.writeUInt16BE(theItem.writeValue[arrayIndex], thePointer);
          break;
        case "X":
          theByte = theByte | (theItem.writeValue[arrayIndex] === true ? 1 : 0) << bitShiftAmount;
          theItem.writeBuffer.writeUInt8(theByte, thePointer);
          bitShiftAmount++;
          break;
        case "B":
        case "BYTE":
          theItem.writeBuffer.writeUInt8(theItem.writeValue[arrayIndex], thePointer);
          break;
        case "C":
        case "CHAR":
          theItem.writeBuffer.writeUInt8(theItem.writeValue.charCodeAt(arrayIndex), thePointer);
          break;
        case "S":
        case "STRING":
          theItem.writeBuffer.writeUInt8(theItem.dtypelen - 2, thePointer);
          theItem.writeBuffer.writeUInt8(Math.min(theItem.dtypelen - 2, theItem.writeValue[arrayIndex].length), thePointer + 1);
          for (var charOffset = 2; charOffset < theItem.dtypelen; charOffset++) {
            if (charOffset < theItem.writeValue[arrayIndex].length + 2) {
              theItem.writeBuffer.writeUInt8(theItem.writeValue[arrayIndex].charCodeAt(charOffset - 2), thePointer + charOffset);
            } else {
              theItem.writeBuffer.writeUInt8(32, thePointer + charOffset);
            }
          }
          break;
        case "TIMER":
        case "COUNTER":
          theItem.writeBuffer.writeInt16BE(theItem.writeValue[arrayIndex], thePointer);
          break;
        default:
          outputLog("Unknown data type when preparing array write packet - should never happen.  Should have been caught earlier.  " + theItem.datatype);
          return 0;
      }
      if (theItem.datatype == "X") {
        if ((arrayIndex + theItem.bitOffset + 1) % 8 === 0 || arrayIndex == theItem.arrayLength - 1) {
          thePointer += theItem.dtypelen;
          bitShiftAmount = 0;
          theByte = 0;
        }
      } else {
        thePointer += theItem.dtypelen;
      }
    }
  } else {
    switch (theItem.datatype) {
      case "DT":
        writeDT(theItem.writeValue, theItem.writeBuffer, thePointer, false);
        break;
      case "DTZ":
        writeDT(theItem.writeValue, theItem.writeBuffer, thePointer, true);
        break;
      case "DTL":
        writeDTL(theItem.writeValue, theItem.writeBuffer, thePointer, false);
        break;
      case "DTLZ":
        writeDTL(theItem.writeValue, theItem.writeBuffer, thePointer, true);
        break;
      case "REAL":
        theItem.writeBuffer.writeFloatBE(theItem.writeValue, thePointer);
        break;
      case "LREAL":
        theItem.writeBuffer.writeDoubleBE(theItem.writeValue, thePointer);
        break;
      case "LINT":
        break;
      case "DWORD":
        theItem.writeBuffer.writeUInt32BE(theItem.writeValue, thePointer);
        break;
      case "DINT":
        theItem.writeBuffer.writeInt32BE(theItem.writeValue, thePointer);
        break;
      case "INT":
        theItem.writeBuffer.writeInt16BE(theItem.writeValue, thePointer);
        break;
      case "WORD":
        theItem.writeBuffer.writeUInt16BE(theItem.writeValue, thePointer);
        break;
      case "X":
        theItem.writeBuffer.writeUInt8(theItem.writeValue === true ? 1 : 0, thePointer);
        break;
      case "B":
      case "BYTE":
        theItem.writeBuffer.writeUInt8(theItem.writeValue, thePointer);
        break;
      case "C":
      case "CHAR":
        theItem.writeBuffer.writeUInt8(theItem.writeValue.charCodeAt(0), thePointer);
        break;
      case "S":
      case "STRING":
        theItem.writeBuffer.writeUInt8(theItem.dtypelen - 2, thePointer);
        theItem.writeBuffer.writeUInt8(Math.min(theItem.dtypelen - 2, theItem.writeValue.length), thePointer + 1);
        for (var charOffset = 2; charOffset < theItem.dtypelen; charOffset++) {
          if (charOffset < theItem.writeValue.length + 2) {
            theItem.writeBuffer.writeUInt8(theItem.writeValue.charCodeAt(charOffset - 2), thePointer + charOffset);
          } else {
            theItem.writeBuffer.writeUInt8(32, thePointer + charOffset);
          }
        }
        break;
      case "TIMER":
      case "COUNTER":
        theItem.writeBuffer.writeInt16BE(theItem.writeValue, thePointer);
        break;
      default:
        outputLog("Unknown data type in write prepare - should never happen.  Should have been caught earlier.  " + theItem.datatype);
        return 0;
    }
    thePointer += theItem.dtypelen;
  }
  return void 0;
}
function stringToS7Addr(addr, useraddr, cParam) {
  var theItem, splitString, splitString2;
  if (useraddr === "_COMMERR") {
    return void 0;
  }
  theItem = new S7Item();
  splitString = addr.split(",");
  if (splitString.length === 0 || splitString.length > 2) {
    outputLog("Error - String Couldn't Split Properly.");
    return void 0;
  }
  if (splitString.length > 1) {
    theItem.addrtype = "DB";
    splitString2 = splitString[1].split(".");
    theItem.datatype = splitString2[0].replace(/[0-9]/gi, "").toUpperCase();
    if (theItem.datatype === "X" && splitString2.length === 3) {
      theItem.arrayLength = parseInt(splitString2[2], 10);
    } else if ((theItem.datatype === "S" || theItem.datatype === "STRING") && splitString2.length === 3) {
      theItem.dtypelen = parseInt(splitString2[1], 10) + 2;
      theItem.arrayLength = parseInt(splitString2[2], 10);
    } else if ((theItem.datatype === "S" || theItem.datatype === "STRING") && splitString2.length === 2) {
      theItem.dtypelen = parseInt(splitString2[1], 10) + 2;
      theItem.arrayLength = 1;
    } else if (theItem.datatype !== "X" && splitString2.length === 2) {
      theItem.arrayLength = parseInt(splitString2[1], 10);
    } else {
      theItem.arrayLength = 1;
    }
    if (theItem.arrayLength <= 0) {
      outputLog("Zero length arrays not allowed, returning undefined");
      return void 0;
    }
    theItem.dbNumber = parseInt(splitString[0].replace(/[A-z]/gi, ""), 10);
    theItem.offset = parseInt(splitString2[0].replace(/[A-z]/gi, ""), 10);
    if (splitString2.length > 1 && theItem.datatype === "X") {
      theItem.bitOffset = parseInt(splitString2[1], 10);
      if (theItem.bitOffset > 7) {
        outputLog("Invalid bit offset specified for address " + addr);
        return void 0;
      }
    }
  } else {
    splitString2 = addr.split(".");
    switch (splitString2[0].replace(/[0-9]/gi, "")) {
      case "PIB":
      case "PEB":
      case "PQB":
      case "PAB":
        theItem.addrtype = "P";
        theItem.datatype = "BYTE";
        break;
      case "PIC":
      case "PEC":
      case "PQC":
      case "PAC":
        theItem.addrtype = "P";
        theItem.datatype = "CHAR";
        break;
      case "PIW":
      case "PEW":
      case "PQW":
      case "PAW":
        theItem.addrtype = "P";
        theItem.datatype = "WORD";
        break;
      case "PII":
      case "PEI":
      case "PQI":
      case "PAI":
        theItem.addrtype = "P";
        theItem.datatype = "INT";
        break;
      case "PID":
      case "PED":
      case "PQD":
      case "PAD":
        theItem.addrtype = "P";
        theItem.datatype = "DWORD";
        break;
      case "PIDI":
      case "PEDI":
      case "PQDI":
      case "PADI":
        theItem.addrtype = "P";
        theItem.datatype = "DINT";
        break;
      case "PIR":
      case "PER":
      case "PQR":
      case "PAR":
        theItem.addrtype = "P";
        theItem.datatype = "REAL";
        break;
      case "I":
      case "E":
        theItem.addrtype = "I";
        theItem.datatype = "X";
        break;
      case "IB":
      case "EB":
        theItem.addrtype = "I";
        theItem.datatype = "BYTE";
        break;
      case "IC":
      case "EC":
        theItem.addrtype = "I";
        theItem.datatype = "CHAR";
        break;
      case "IW":
      case "EW":
        theItem.addrtype = "I";
        theItem.datatype = "WORD";
        break;
      case "II":
      case "EI":
        theItem.addrtype = "I";
        theItem.datatype = "INT";
        break;
      case "ID":
      case "ED":
        theItem.addrtype = "I";
        theItem.datatype = "DWORD";
        break;
      case "IDI":
      case "EDI":
        theItem.addrtype = "I";
        theItem.datatype = "DINT";
        break;
      case "IR":
      case "ER":
        theItem.addrtype = "I";
        theItem.datatype = "REAL";
        break;
      case "ILR":
      case "ELR":
        theItem.addrtype = "I";
        theItem.datatype = "LREAL";
        break;
      case "ILI":
      case "ELI":
        theItem.addrtype = "I";
        theItem.datatype = "LINT";
        break;
      case "Q":
      case "A":
        theItem.addrtype = "Q";
        theItem.datatype = "X";
        break;
      case "QB":
      case "AB":
        theItem.addrtype = "Q";
        theItem.datatype = "BYTE";
        break;
      case "QC":
      case "AC":
        theItem.addrtype = "Q";
        theItem.datatype = "CHAR";
        break;
      case "QW":
      case "AW":
        theItem.addrtype = "Q";
        theItem.datatype = "WORD";
        break;
      case "QI":
      case "AI":
        theItem.addrtype = "Q";
        theItem.datatype = "INT";
        break;
      case "QD":
      case "AD":
        theItem.addrtype = "Q";
        theItem.datatype = "DWORD";
        break;
      case "QDI":
      case "ADI":
        theItem.addrtype = "Q";
        theItem.datatype = "DINT";
        break;
      case "QR":
      case "AR":
        theItem.addrtype = "Q";
        theItem.datatype = "REAL";
        break;
      case "QLR":
      case "ALR":
        theItem.addrtype = "Q";
        theItem.datatype = "LREAL";
        break;
      case "QLI":
      case "ALI":
        theItem.addrtype = "Q";
        theItem.datatype = "LINT";
        break;
      case "M":
        theItem.addrtype = "M";
        theItem.datatype = "X";
        break;
      case "MB":
        theItem.addrtype = "M";
        theItem.datatype = "BYTE";
        break;
      case "MC":
        theItem.addrtype = "M";
        theItem.datatype = "CHAR";
        break;
      case "MW":
        theItem.addrtype = "M";
        theItem.datatype = "WORD";
        break;
      case "MI":
        theItem.addrtype = "M";
        theItem.datatype = "INT";
        break;
      case "MD":
        theItem.addrtype = "M";
        theItem.datatype = "DWORD";
        break;
      case "MDI":
        theItem.addrtype = "M";
        theItem.datatype = "DINT";
        break;
      case "MR":
        theItem.addrtype = "M";
        theItem.datatype = "REAL";
        break;
      case "MLR":
        theItem.addrtype = "M";
        theItem.datatype = "LREAL";
        break;
      case "MLI":
        theItem.addrtype = "M";
        theItem.datatype = "LINT";
        break;
      case "T":
        theItem.addrtype = "T";
        theItem.datatype = "TIMER";
        break;
      case "C":
        theItem.addrtype = "C";
        theItem.datatype = "COUNTER";
        break;
      default:
        outputLog("Failed to find a match for " + splitString2[0]);
        return void 0;
    }
    theItem.bitOffset = 0;
    if (splitString2.length > 1 && theItem.datatype === "X") {
      theItem.bitOffset = parseInt(splitString2[1].replace(/[A-z]/gi, ""), 10);
      if (splitString2.length > 2) {
        theItem.arrayLength = parseInt(splitString2[2].replace(/[A-z]/gi, ""), 10);
      } else {
        theItem.arrayLength = 1;
      }
    } else if (splitString2.length > 1 && theItem.datatype !== "X") {
      theItem.arrayLength = parseInt(splitString2[1].replace(/[A-z]/gi, ""), 10);
    } else {
      theItem.arrayLength = 1;
    }
    theItem.dbNumber = 0;
    theItem.offset = parseInt(splitString2[0].replace(/[A-z]/gi, ""), 10);
  }
  if (theItem.datatype === "DI") {
    theItem.datatype = "DINT";
  }
  if (theItem.datatype === "I") {
    theItem.datatype = "INT";
  }
  if (theItem.datatype === "DW" || theItem.datatype === "DWT") {
    theItem.datatype = "DWORD";
  }
  if (theItem.datatype === "WDT") {
    if (cParam.wdtAsUTC) {
      theItem.datatype = "DTZ";
    } else {
      theItem.datatype = "DT";
    }
  }
  if (theItem.datatype === "W") {
    theItem.datatype = "WORD";
  }
  if (theItem.datatype === "R") {
    theItem.datatype = "REAL";
  }
  if (theItem.datatype === "LR") {
    theItem.datatype = "LREAL";
  }
  if (theItem.datatype === "LI") {
    theItem.datatype = "LINT";
  }
  switch (theItem.datatype) {
    case "DTL":
    case "DTLZ":
      theItem.dtypelen = 12;
      break;
    case "LREAL":
    case "LINT":
    case "DT":
    case "DTZ":
      theItem.dtypelen = 8;
      break;
    case "REAL":
    case "DWORD":
    case "DINT":
      theItem.dtypelen = 4;
      break;
    case "INT":
    case "WORD":
    case "TIMER":
    case "COUNTER":
      theItem.dtypelen = 2;
      break;
    case "X":
    case "B":
    case "C":
    case "BYTE":
    case "CHAR":
      theItem.dtypelen = 1;
      break;
    case "S":
    case "STRING":
      break;
    default:
      outputLog("Unknown data type " + theItem.datatype);
      return void 0;
  }
  theItem.readTransportCode = 4;
  switch (theItem.addrtype) {
    case "DB":
    case "DI":
      theItem.areaS7Code = 132;
      break;
    case "I":
    case "E":
      theItem.areaS7Code = 129;
      break;
    case "Q":
    case "A":
      theItem.areaS7Code = 130;
      break;
    case "M":
      theItem.areaS7Code = 131;
      break;
    case "P":
      theItem.areaS7Code = 128;
      break;
    case "C":
      theItem.areaS7Code = 28;
      theItem.readTransportCode = 9;
      break;
    case "T":
      theItem.areaS7Code = 29;
      theItem.readTransportCode = 9;
      break;
    default:
      outputLog("Unknown memory area entered - " + theItem.addrtype);
      return void 0;
  }
  if (theItem.datatype === "X" && theItem.arrayLength === 1) {
    theItem.writeTransportCode = 3;
  } else {
    theItem.writeTransportCode = theItem.readTransportCode;
  }
  theItem.addr = addr;
  if (useraddr === void 0) {
    theItem.useraddr = addr;
  } else {
    theItem.useraddr = useraddr;
  }
  if (theItem.datatype === "X") {
    theItem.byteLength = Math.ceil((theItem.bitOffset + theItem.arrayLength) / 8);
  } else {
    theItem.byteLength = theItem.arrayLength * theItem.dtypelen;
  }
  theItem.byteLengthWithFill = theItem.byteLength;
  if (theItem.byteLengthWithFill % 2) {
    theItem.byteLengthWithFill += 1;
  }
  return theItem;
}
function S7Packet() {
  this.seqNum = void 0;
  this.itemList = void 0;
  this.reqTime = void 0;
  this.sent = false;
  this.rcvd = false;
  this.timeoutError = void 0;
  this.timeout = void 0;
}
function S7Item() {
  this.addr = void 0;
  this.useraddr = void 0;
  this.addrtype = void 0;
  this.datatype = void 0;
  this.dbNumber = void 0;
  this.bitOffset = void 0;
  this.offset = void 0;
  this.arrayLength = void 0;
  this.dtypelen = void 0;
  this.areaS7Code = void 0;
  this.byteLength = void 0;
  this.byteLengthWithFill = void 0;
  this.readTransportCode = void 0;
  this.writeTransportCode = void 0;
  this.byteBuffer = Buffer.alloc(8192);
  this.writeBuffer = Buffer.alloc(8192);
  this.qualityBuffer = Buffer.alloc(8192);
  this.writeQualityBuffer = Buffer.alloc(8192);
  this.value = void 0;
  this.writeValue = void 0;
  this.valid = false;
  this.errCode = void 0;
  this.part = void 0;
  this.maxPart = void 0;
  this.isOptimized = false;
  this.resultReference = void 0;
  this.itemReference = void 0;
  this.clone = function() {
    var newObj = new S7Item();
    for (var i in this) {
      if (i == "clone") continue;
      newObj[i] = this[i];
    }
    return newObj;
  };
  this.badValue = function() {
    switch (this.datatype) {
      case "DT":
      case "DTZ":
      case "DTL":
      case "DTLZ":
        return /* @__PURE__ */ new Date(NaN);
      case "REAL":
      case "LREAL":
        return 0;
      case "DWORD":
      case "DINT":
      case "INT":
      case "LINT":
      case "WORD":
      case "B":
      case "BYTE":
      case "TIMER":
      case "COUNTER":
        return 0;
      case "X":
        return false;
      case "C":
      case "CHAR":
      case "S":
      case "STRING":
        return "";
      default:
        outputLog("Unknown data type when figuring out bad value - should never happen.  Should have been caught earlier.  " + this.datatype);
        return 0;
    }
  };
}
function itemListSorter(a, b) {
  if (a.areaS7Code < b.areaS7Code) {
    return -1;
  }
  if (a.areaS7Code > b.areaS7Code) {
    return 1;
  }
  if (a.addrtype === "DB") {
    if (a.dbNumber < b.dbNumber) {
      return -1;
    }
    if (a.dbNumber > b.dbNumber) {
      return 1;
    }
  }
  if (a.offset < b.offset) {
    return -1;
  }
  if (a.offset > b.offset) {
    return 1;
  }
  if (a.bitOffset < b.bitOffset) {
    return -1;
  }
  if (a.bitOffset > b.bitOffset) {
    return 1;
  }
  if (a.byteLength > b.byteLength) {
    return -1;
  }
  if (a.byteLength < b.byteLength) {
    return 1;
  }
}
function doNothing(arg) {
  return arg;
}
function isQualityOK(obj) {
  if (typeof obj === "string") {
    if (obj !== "OK") {
      return false;
    }
  } else if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      if (typeof obj[i] !== "string" || obj[i] !== "OK") {
        return false;
      }
    }
  }
  return true;
}
function outputLog(txt, debugLevel, id) {
  if (silentMode) return;
  var idtext;
  if (typeof id === "undefined") {
    idtext = "";
  } else {
    idtext = " " + id;
  }
  if (typeof debugLevel === "undefined" || effectiveDebugLevel >= debugLevel) {
    console.log("[" + process.hrtime() + idtext + "] " + util.format(txt));
  }
}
const S7Client = /* @__PURE__ */ getDefaultExportFromCjs(nodeS7);
const _PLCConnector = class _PLCConnector {
  constructor(ip = "192.168.2.20", port = 102) {
    __publicField(this, "client");
    __publicField(this, "isConnected", false);
    this.ip = ip;
    this.port = port;
    this.client = new S7Client();
  }
  // 单例访问入口
  static getInstance() {
    if (!_PLCConnector.instance) {
      _PLCConnector.instance = new _PLCConnector();
    }
    return _PLCConnector.instance;
  }
  async connectIfNeeded() {
    if (this.isConnected) {
      return;
    }
    return new Promise((resolve, reject) => {
      this.client.initiateConnection(
        { host: this.ip, port: this.port, rack: 0, slot: 1 },
        (err) => {
          if (err) return reject(new Error("PLC 连接失败: " + err.message));
          this.isConnected = true;
          resolve();
        }
      );
    });
  }
  defineItems(defs) {
    this.client.setTranslationCB((tag) => defs[tag]);
    this.client.addItems(Object.keys(defs));
  }
  async readAll() {
    await this.connectIfNeeded();
    return new Promise((resolve, reject) => {
      this.client.readAllItems((err, values) => {
        if (err) return reject(new Error("PLC 读取失败: " + err));
        resolve(values);
      });
    });
  }
  async writeItems(address, value) {
    await this.connectIfNeeded();
    return new Promise((resolve, reject) => {
      this.client.writeItems(address, value, (err) => {
        if (err) return reject(new Error("PLC 写入失败"));
        resolve();
      });
    });
  }
  disconnect() {
    if (this.isConnected) {
      this.client.dropConnection(() => {
        console.log("[PLC] Disconnected");
      });
      this.isConnected = false;
    }
  }
};
__publicField(_PLCConnector, "instance");
let PLCConnector = _PLCConnector;
var modbusSerial = { exports: {} };
const addBufferBitOp = function() {
  Buffer.prototype.writeBit = function(value, bit, offset) {
    const byteOffset = parseInt(bit / 8 + offset);
    const bitOffset = bit % 8;
    const bitMask = 1 << bitOffset;
    let byte = this.readUInt8(byteOffset);
    if (value) {
      byte |= bitMask;
    } else {
      byte &= ~bitMask;
    }
    this.writeUInt8(byte, byteOffset);
  };
  Buffer.prototype.readBit = function(bit, offset) {
    const byteOffset = parseInt(bit / 8 + offset);
    const bitOffset = bit % 8;
    const bitMask = 1 << bitOffset;
    const byte = this.readUInt8(byteOffset);
    return (byte & bitMask) === bitMask;
  };
};
var buffer_bit = addBufferBitOp;
var crc16 = function crc162(buffer) {
  let crc = 65535;
  let odd;
  for (let i = 0; i < buffer.length; i++) {
    crc = crc ^ buffer[i];
    for (let j = 0; j < 8; j++) {
      odd = crc & 1;
      crc = crc >> 1;
      if (odd) {
        crc = crc ^ 40961;
      }
    }
  }
  return crc;
};
var src$2 = { exports: {} };
var browser$2 = { exports: {} };
var ms;
var hasRequiredMs;
function requireMs() {
  if (hasRequiredMs) return ms;
  hasRequiredMs = 1;
  var s = 1e3;
  var m = s * 60;
  var h = m * 60;
  var d = h * 24;
  var w = d * 7;
  var y = d * 365.25;
  ms = function(val, options) {
    options = options || {};
    var type = typeof val;
    if (type === "string" && val.length > 0) {
      return parse(val);
    } else if (type === "number" && isFinite(val)) {
      return options.long ? fmtLong(val) : fmtShort(val);
    }
    throw new Error(
      "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
    );
  };
  function parse(str) {
    str = String(str);
    if (str.length > 100) {
      return;
    }
    var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
      str
    );
    if (!match) {
      return;
    }
    var n = parseFloat(match[1]);
    var type = (match[2] || "ms").toLowerCase();
    switch (type) {
      case "years":
      case "year":
      case "yrs":
      case "yr":
      case "y":
        return n * y;
      case "weeks":
      case "week":
      case "w":
        return n * w;
      case "days":
      case "day":
      case "d":
        return n * d;
      case "hours":
      case "hour":
      case "hrs":
      case "hr":
      case "h":
        return n * h;
      case "minutes":
      case "minute":
      case "mins":
      case "min":
      case "m":
        return n * m;
      case "seconds":
      case "second":
      case "secs":
      case "sec":
      case "s":
        return n * s;
      case "milliseconds":
      case "millisecond":
      case "msecs":
      case "msec":
      case "ms":
        return n;
      default:
        return void 0;
    }
  }
  function fmtShort(ms2) {
    var msAbs = Math.abs(ms2);
    if (msAbs >= d) {
      return Math.round(ms2 / d) + "d";
    }
    if (msAbs >= h) {
      return Math.round(ms2 / h) + "h";
    }
    if (msAbs >= m) {
      return Math.round(ms2 / m) + "m";
    }
    if (msAbs >= s) {
      return Math.round(ms2 / s) + "s";
    }
    return ms2 + "ms";
  }
  function fmtLong(ms2) {
    var msAbs = Math.abs(ms2);
    if (msAbs >= d) {
      return plural(ms2, msAbs, d, "day");
    }
    if (msAbs >= h) {
      return plural(ms2, msAbs, h, "hour");
    }
    if (msAbs >= m) {
      return plural(ms2, msAbs, m, "minute");
    }
    if (msAbs >= s) {
      return plural(ms2, msAbs, s, "second");
    }
    return ms2 + " ms";
  }
  function plural(ms2, msAbs, n, name2) {
    var isPlural = msAbs >= n * 1.5;
    return Math.round(ms2 / n) + " " + name2 + (isPlural ? "s" : "");
  }
  return ms;
}
var common$2;
var hasRequiredCommon$2;
function requireCommon$2() {
  if (hasRequiredCommon$2) return common$2;
  hasRequiredCommon$2 = 1;
  function setup(env) {
    createDebug.debug = createDebug;
    createDebug.default = createDebug;
    createDebug.coerce = coerce;
    createDebug.disable = disable;
    createDebug.enable = enable;
    createDebug.enabled = enabled;
    createDebug.humanize = requireMs();
    createDebug.destroy = destroy;
    Object.keys(env).forEach((key) => {
      createDebug[key] = env[key];
    });
    createDebug.names = [];
    createDebug.skips = [];
    createDebug.formatters = {};
    function selectColor(namespace) {
      let hash = 0;
      for (let i = 0; i < namespace.length; i++) {
        hash = (hash << 5) - hash + namespace.charCodeAt(i);
        hash |= 0;
      }
      return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
    }
    createDebug.selectColor = selectColor;
    function createDebug(namespace) {
      let prevTime;
      let enableOverride = null;
      let namespacesCache;
      let enabledCache;
      function debug(...args) {
        if (!debug.enabled) {
          return;
        }
        const self2 = debug;
        const curr = Number(/* @__PURE__ */ new Date());
        const ms2 = curr - (prevTime || curr);
        self2.diff = ms2;
        self2.prev = prevTime;
        self2.curr = curr;
        prevTime = curr;
        args[0] = createDebug.coerce(args[0]);
        if (typeof args[0] !== "string") {
          args.unshift("%O");
        }
        let index = 0;
        args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
          if (match === "%%") {
            return "%";
          }
          index++;
          const formatter = createDebug.formatters[format];
          if (typeof formatter === "function") {
            const val = args[index];
            match = formatter.call(self2, val);
            args.splice(index, 1);
            index--;
          }
          return match;
        });
        createDebug.formatArgs.call(self2, args);
        const logFn = self2.log || createDebug.log;
        logFn.apply(self2, args);
      }
      debug.namespace = namespace;
      debug.useColors = createDebug.useColors();
      debug.color = createDebug.selectColor(namespace);
      debug.extend = extend;
      debug.destroy = createDebug.destroy;
      Object.defineProperty(debug, "enabled", {
        enumerable: true,
        configurable: false,
        get: () => {
          if (enableOverride !== null) {
            return enableOverride;
          }
          if (namespacesCache !== createDebug.namespaces) {
            namespacesCache = createDebug.namespaces;
            enabledCache = createDebug.enabled(namespace);
          }
          return enabledCache;
        },
        set: (v) => {
          enableOverride = v;
        }
      });
      if (typeof createDebug.init === "function") {
        createDebug.init(debug);
      }
      return debug;
    }
    function extend(namespace, delimiter) {
      const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
      newDebug.log = this.log;
      return newDebug;
    }
    function enable(namespaces) {
      createDebug.save(namespaces);
      createDebug.namespaces = namespaces;
      createDebug.names = [];
      createDebug.skips = [];
      const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
      for (const ns of split) {
        if (ns[0] === "-") {
          createDebug.skips.push(ns.slice(1));
        } else {
          createDebug.names.push(ns);
        }
      }
    }
    function matchesTemplate(search, template) {
      let searchIndex = 0;
      let templateIndex = 0;
      let starIndex = -1;
      let matchIndex = 0;
      while (searchIndex < search.length) {
        if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
          if (template[templateIndex] === "*") {
            starIndex = templateIndex;
            matchIndex = searchIndex;
            templateIndex++;
          } else {
            searchIndex++;
            templateIndex++;
          }
        } else if (starIndex !== -1) {
          templateIndex = starIndex + 1;
          matchIndex++;
          searchIndex = matchIndex;
        } else {
          return false;
        }
      }
      while (templateIndex < template.length && template[templateIndex] === "*") {
        templateIndex++;
      }
      return templateIndex === template.length;
    }
    function disable() {
      const namespaces = [
        ...createDebug.names,
        ...createDebug.skips.map((namespace) => "-" + namespace)
      ].join(",");
      createDebug.enable("");
      return namespaces;
    }
    function enabled(name2) {
      for (const skip of createDebug.skips) {
        if (matchesTemplate(name2, skip)) {
          return false;
        }
      }
      for (const ns of createDebug.names) {
        if (matchesTemplate(name2, ns)) {
          return true;
        }
      }
      return false;
    }
    function coerce(val) {
      if (val instanceof Error) {
        return val.stack || val.message;
      }
      return val;
    }
    function destroy() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    createDebug.enable(createDebug.load());
    return createDebug;
  }
  common$2 = setup;
  return common$2;
}
var hasRequiredBrowser$2;
function requireBrowser$2() {
  if (hasRequiredBrowser$2) return browser$2.exports;
  hasRequiredBrowser$2 = 1;
  (function(module, exports) {
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.storage = localstorage();
    exports.destroy = /* @__PURE__ */ (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      let m;
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args) {
      args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      let index = 0;
      let lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c);
    }
    exports.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports.storage.setItem("debug", namespaces);
        } else {
          exports.storage.removeItem("debug");
        }
      } catch (error) {
      }
    }
    function load() {
      let r;
      try {
        r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
      } catch (error) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error) {
      }
    }
    module.exports = requireCommon$2()(exports);
    const { formatters } = module.exports;
    formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (error) {
        return "[UnexpectedJSONParseError]: " + error.message;
      }
    };
  })(browser$2, browser$2.exports);
  return browser$2.exports;
}
var node$2 = { exports: {} };
var hasFlag;
var hasRequiredHasFlag;
function requireHasFlag() {
  if (hasRequiredHasFlag) return hasFlag;
  hasRequiredHasFlag = 1;
  hasFlag = (flag, argv = process.argv) => {
    const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
    const position = argv.indexOf(prefix + flag);
    const terminatorPosition = argv.indexOf("--");
    return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
  };
  return hasFlag;
}
var supportsColor_1;
var hasRequiredSupportsColor;
function requireSupportsColor() {
  if (hasRequiredSupportsColor) return supportsColor_1;
  hasRequiredSupportsColor = 1;
  const os = require$$0$1;
  const tty = require$$0;
  const hasFlag2 = requireHasFlag();
  const { env } = process;
  let forceColor;
  if (hasFlag2("no-color") || hasFlag2("no-colors") || hasFlag2("color=false") || hasFlag2("color=never")) {
    forceColor = 0;
  } else if (hasFlag2("color") || hasFlag2("colors") || hasFlag2("color=true") || hasFlag2("color=always")) {
    forceColor = 1;
  }
  if ("FORCE_COLOR" in env) {
    if (env.FORCE_COLOR === "true") {
      forceColor = 1;
    } else if (env.FORCE_COLOR === "false") {
      forceColor = 0;
    } else {
      forceColor = env.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env.FORCE_COLOR, 10), 3);
    }
  }
  function translateLevel(level) {
    if (level === 0) {
      return false;
    }
    return {
      level,
      hasBasic: true,
      has256: level >= 2,
      has16m: level >= 3
    };
  }
  function supportsColor(haveStream, streamIsTTY) {
    if (forceColor === 0) {
      return 0;
    }
    if (hasFlag2("color=16m") || hasFlag2("color=full") || hasFlag2("color=truecolor")) {
      return 3;
    }
    if (hasFlag2("color=256")) {
      return 2;
    }
    if (haveStream && !streamIsTTY && forceColor === void 0) {
      return 0;
    }
    const min = forceColor || 0;
    if (env.TERM === "dumb") {
      return min;
    }
    if (process.platform === "win32") {
      const osRelease = os.release().split(".");
      if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
        return Number(osRelease[2]) >= 14931 ? 3 : 2;
      }
      return 1;
    }
    if ("CI" in env) {
      if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
        return 1;
      }
      return min;
    }
    if ("TEAMCITY_VERSION" in env) {
      return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
    }
    if (env.COLORTERM === "truecolor") {
      return 3;
    }
    if ("TERM_PROGRAM" in env) {
      const version2 = parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
      switch (env.TERM_PROGRAM) {
        case "iTerm.app":
          return version2 >= 3 ? 3 : 2;
        case "Apple_Terminal":
          return 2;
      }
    }
    if (/-256(color)?$/i.test(env.TERM)) {
      return 2;
    }
    if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
      return 1;
    }
    if ("COLORTERM" in env) {
      return 1;
    }
    return min;
  }
  function getSupportLevel(stream) {
    const level = supportsColor(stream, stream && stream.isTTY);
    return translateLevel(level);
  }
  supportsColor_1 = {
    supportsColor: getSupportLevel,
    stdout: translateLevel(supportsColor(true, tty.isatty(1))),
    stderr: translateLevel(supportsColor(true, tty.isatty(2)))
  };
  return supportsColor_1;
}
var hasRequiredNode$2;
function requireNode$2() {
  if (hasRequiredNode$2) return node$2.exports;
  hasRequiredNode$2 = 1;
  (function(module, exports) {
    const tty = require$$0;
    const util2 = require$$1$2;
    exports.init = init;
    exports.log = log;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.destroy = util2.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = requireSupportsColor();
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error) {
    }
    exports.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
        return k.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj[prop] = val;
      return obj;
    }, {});
    function useColors() {
      return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args) {
      const { namespace: name2, useColors: useColors2 } = this;
      if (useColors2) {
        const c = this.color;
        const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
        const prefix = `  ${colorCode};1m${name2} \x1B[0m`;
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = getDate() + name2 + " " + args[0];
      }
    }
    function getDate() {
      if (exports.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log(...args) {
      return process.stderr.write(util2.formatWithOptions(exports.inspectOpts, ...args) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function init(debug) {
      debug.inspectOpts = {};
      const keys = Object.keys(exports.inspectOpts);
      for (let i = 0; i < keys.length; i++) {
        debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
      }
    }
    module.exports = requireCommon$2()(exports);
    const { formatters } = module.exports;
    formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util2.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
    };
    formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util2.inspect(v, this.inspectOpts);
    };
  })(node$2, node$2.exports);
  return node$2.exports;
}
if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
  src$2.exports = requireBrowser$2();
} else {
  src$2.exports = requireNode$2();
}
var srcExports = src$2.exports;
var dist$g = {};
var dist$f = {};
var hasRequiredDist$g;
function requireDist$g() {
  if (hasRequiredDist$g) return dist$f;
  hasRequiredDist$g = 1;
  Object.defineProperty(dist$f, "__esModule", { value: true });
  dist$f.ByteLengthParser = void 0;
  const stream_1 = require$$0$2;
  class ByteLengthParser extends stream_1.Transform {
    constructor(options) {
      super(options);
      __publicField(this, "length");
      __publicField(this, "position");
      __publicField(this, "buffer");
      if (typeof options.length !== "number") {
        throw new TypeError('"length" is not a number');
      }
      if (options.length < 1) {
        throw new TypeError('"length" is not greater than 0');
      }
      this.length = options.length;
      this.position = 0;
      this.buffer = Buffer.alloc(this.length);
    }
    _transform(chunk, _encoding, cb) {
      let cursor = 0;
      while (cursor < chunk.length) {
        this.buffer[this.position] = chunk[cursor];
        cursor++;
        this.position++;
        if (this.position === this.length) {
          this.push(this.buffer);
          this.buffer = Buffer.alloc(this.length);
          this.position = 0;
        }
      }
      cb();
    }
    _flush(cb) {
      this.push(this.buffer.slice(0, this.position));
      this.buffer = Buffer.alloc(this.length);
      cb();
    }
  }
  dist$f.ByteLengthParser = ByteLengthParser;
  return dist$f;
}
var dist$e = {};
var hasRequiredDist$f;
function requireDist$f() {
  if (hasRequiredDist$f) return dist$e;
  hasRequiredDist$f = 1;
  Object.defineProperty(dist$e, "__esModule", { value: true });
  dist$e.CCTalkParser = void 0;
  const stream_1 = require$$0$2;
  class CCTalkParser extends stream_1.Transform {
    constructor(maxDelayBetweenBytesMs = 50) {
      super();
      __publicField(this, "array");
      __publicField(this, "cursor");
      __publicField(this, "lastByteFetchTime");
      __publicField(this, "maxDelayBetweenBytesMs");
      this.array = [];
      this.cursor = 0;
      this.lastByteFetchTime = 0;
      this.maxDelayBetweenBytesMs = maxDelayBetweenBytesMs;
    }
    _transform(buffer, encoding, cb) {
      if (this.maxDelayBetweenBytesMs > 0) {
        const now = Date.now();
        if (now - this.lastByteFetchTime > this.maxDelayBetweenBytesMs) {
          this.array = [];
          this.cursor = 0;
        }
        this.lastByteFetchTime = now;
      }
      this.cursor += buffer.length;
      Array.from(buffer).map((byte) => this.array.push(byte));
      while (this.cursor > 1 && this.cursor >= this.array[1] + 5) {
        const FullMsgLength = this.array[1] + 5;
        const frame = Buffer.from(this.array.slice(0, FullMsgLength));
        this.array = this.array.slice(frame.length, this.array.length);
        this.cursor -= FullMsgLength;
        this.push(frame);
      }
      cb();
    }
  }
  dist$e.CCTalkParser = CCTalkParser;
  return dist$e;
}
var dist$d = {};
var hasRequiredDist$e;
function requireDist$e() {
  if (hasRequiredDist$e) return dist$d;
  hasRequiredDist$e = 1;
  Object.defineProperty(dist$d, "__esModule", { value: true });
  dist$d.DelimiterParser = void 0;
  const stream_1 = require$$0$2;
  class DelimiterParser extends stream_1.Transform {
    constructor({ delimiter, includeDelimiter = false, ...options }) {
      super(options);
      __publicField(this, "includeDelimiter");
      __publicField(this, "delimiter");
      __publicField(this, "buffer");
      if (delimiter === void 0) {
        throw new TypeError('"delimiter" is not a bufferable object');
      }
      if (delimiter.length === 0) {
        throw new TypeError('"delimiter" has a 0 or undefined length');
      }
      this.includeDelimiter = includeDelimiter;
      this.delimiter = Buffer.from(delimiter);
      this.buffer = Buffer.alloc(0);
    }
    _transform(chunk, encoding, cb) {
      let data = Buffer.concat([this.buffer, chunk]);
      let position;
      while ((position = data.indexOf(this.delimiter)) !== -1) {
        this.push(data.slice(0, position + (this.includeDelimiter ? this.delimiter.length : 0)));
        data = data.slice(position + this.delimiter.length);
      }
      this.buffer = data;
      cb();
    }
    _flush(cb) {
      this.push(this.buffer);
      this.buffer = Buffer.alloc(0);
      cb();
    }
  }
  dist$d.DelimiterParser = DelimiterParser;
  return dist$d;
}
var dist$c = {};
var hasRequiredDist$d;
function requireDist$d() {
  if (hasRequiredDist$d) return dist$c;
  hasRequiredDist$d = 1;
  Object.defineProperty(dist$c, "__esModule", { value: true });
  dist$c.InterByteTimeoutParser = void 0;
  const stream_1 = require$$0$2;
  class InterByteTimeoutParser extends stream_1.Transform {
    constructor({ maxBufferSize = 65536, interval, ...transformOptions }) {
      super(transformOptions);
      __publicField(this, "maxBufferSize");
      __publicField(this, "currentPacket");
      __publicField(this, "interval");
      __publicField(this, "intervalID");
      if (!interval) {
        throw new TypeError('"interval" is required');
      }
      if (typeof interval !== "number" || Number.isNaN(interval)) {
        throw new TypeError('"interval" is not a number');
      }
      if (interval < 1) {
        throw new TypeError('"interval" is not greater than 0');
      }
      if (typeof maxBufferSize !== "number" || Number.isNaN(maxBufferSize)) {
        throw new TypeError('"maxBufferSize" is not a number');
      }
      if (maxBufferSize < 1) {
        throw new TypeError('"maxBufferSize" is not greater than 0');
      }
      this.maxBufferSize = maxBufferSize;
      this.currentPacket = [];
      this.interval = interval;
    }
    _transform(chunk, encoding, cb) {
      if (this.intervalID) {
        clearTimeout(this.intervalID);
      }
      for (let offset = 0; offset < chunk.length; offset++) {
        this.currentPacket.push(chunk[offset]);
        if (this.currentPacket.length >= this.maxBufferSize) {
          this.emitPacket();
        }
      }
      this.intervalID = setTimeout(this.emitPacket.bind(this), this.interval);
      cb();
    }
    emitPacket() {
      if (this.intervalID) {
        clearTimeout(this.intervalID);
      }
      if (this.currentPacket.length > 0) {
        this.push(Buffer.from(this.currentPacket));
      }
      this.currentPacket = [];
    }
    _flush(cb) {
      this.emitPacket();
      cb();
    }
  }
  dist$c.InterByteTimeoutParser = InterByteTimeoutParser;
  return dist$c;
}
var dist$b = {};
var hasRequiredDist$c;
function requireDist$c() {
  if (hasRequiredDist$c) return dist$b;
  hasRequiredDist$c = 1;
  Object.defineProperty(dist$b, "__esModule", { value: true });
  dist$b.PacketLengthParser = void 0;
  const stream_1 = require$$0$2;
  class PacketLengthParser extends stream_1.Transform {
    constructor(options = {}) {
      super(options);
      __publicField(this, "buffer");
      __publicField(this, "start");
      __publicField(this, "opts");
      const { delimiter = [170], delimiterBytes = 1, packetOverhead = 2, lengthBytes = 1, lengthOffset = 1, maxLen = 255 } = options;
      this.opts = {
        delimiter: [].concat(delimiter),
        delimiterBytes,
        packetOverhead,
        lengthBytes,
        lengthOffset,
        maxLen
      };
      this.buffer = Buffer.alloc(0);
      this.start = false;
    }
    _transform(chunk, encoding, cb) {
      for (let ndx = 0; ndx < chunk.length; ndx++) {
        const byte = chunk[ndx];
        if (true === this.start) {
          this.buffer = Buffer.concat([this.buffer, Buffer.from([byte])]);
          if (this.buffer.length >= this.opts.lengthOffset + this.opts.lengthBytes) {
            const len = this.buffer.readUIntLE(this.opts.lengthOffset, this.opts.lengthBytes);
            if (this.buffer.length == len + this.opts.packetOverhead || len > this.opts.maxLen) {
              this.push(this.buffer);
              this.buffer = Buffer.alloc(0);
              this.start = false;
            }
          }
        } else {
          this.buffer = Buffer.concat([Buffer.from([byte]), this.buffer]);
          if (this.buffer.length === this.opts.delimiterBytes) {
            const delimiter = this.buffer.readUIntLE(0, this.opts.delimiterBytes);
            if (this.opts.delimiter.includes(delimiter)) {
              this.start = true;
              this.buffer = Buffer.from([...this.buffer].reverse());
            } else {
              this.buffer = Buffer.from(this.buffer.subarray(1, this.buffer.length));
            }
          }
        }
      }
      cb();
    }
    _flush(cb) {
      this.push(this.buffer);
      this.buffer = Buffer.alloc(0);
      cb();
    }
  }
  dist$b.PacketLengthParser = PacketLengthParser;
  return dist$b;
}
var dist$a = {};
var hasRequiredDist$b;
function requireDist$b() {
  if (hasRequiredDist$b) return dist$a;
  hasRequiredDist$b = 1;
  Object.defineProperty(dist$a, "__esModule", { value: true });
  dist$a.ReadlineParser = void 0;
  const parser_delimiter_1 = requireDist$e();
  class ReadlineParser extends parser_delimiter_1.DelimiterParser {
    constructor(options) {
      const opts = {
        delimiter: Buffer.from("\n", "utf8"),
        encoding: "utf8",
        ...options
      };
      if (typeof opts.delimiter === "string") {
        opts.delimiter = Buffer.from(opts.delimiter, opts.encoding);
      }
      super(opts);
    }
  }
  dist$a.ReadlineParser = ReadlineParser;
  return dist$a;
}
var dist$9 = {};
var hasRequiredDist$a;
function requireDist$a() {
  if (hasRequiredDist$a) return dist$9;
  hasRequiredDist$a = 1;
  Object.defineProperty(dist$9, "__esModule", { value: true });
  dist$9.ReadyParser = void 0;
  const stream_1 = require$$0$2;
  class ReadyParser extends stream_1.Transform {
    constructor({ delimiter, ...options }) {
      if (delimiter === void 0) {
        throw new TypeError('"delimiter" is not a bufferable object');
      }
      if (delimiter.length === 0) {
        throw new TypeError('"delimiter" has a 0 or undefined length');
      }
      super(options);
      __publicField(this, "delimiter");
      __publicField(this, "readOffset");
      __publicField(this, "ready");
      this.delimiter = Buffer.from(delimiter);
      this.readOffset = 0;
      this.ready = false;
    }
    _transform(chunk, encoding, cb) {
      if (this.ready) {
        this.push(chunk);
        return cb();
      }
      const delimiter = this.delimiter;
      let chunkOffset = 0;
      while (this.readOffset < delimiter.length && chunkOffset < chunk.length) {
        if (delimiter[this.readOffset] === chunk[chunkOffset]) {
          this.readOffset++;
        } else {
          this.readOffset = 0;
        }
        chunkOffset++;
      }
      if (this.readOffset === delimiter.length) {
        this.ready = true;
        this.emit("ready");
        const chunkRest = chunk.slice(chunkOffset);
        if (chunkRest.length > 0) {
          this.push(chunkRest);
        }
      }
      cb();
    }
  }
  dist$9.ReadyParser = ReadyParser;
  return dist$9;
}
var dist$8 = {};
var hasRequiredDist$9;
function requireDist$9() {
  if (hasRequiredDist$9) return dist$8;
  hasRequiredDist$9 = 1;
  Object.defineProperty(dist$8, "__esModule", { value: true });
  dist$8.RegexParser = void 0;
  const stream_1 = require$$0$2;
  class RegexParser extends stream_1.Transform {
    constructor({ regex, ...options }) {
      const opts = {
        encoding: "utf8",
        ...options
      };
      if (regex === void 0) {
        throw new TypeError('"options.regex" must be a regular expression pattern or object');
      }
      if (!(regex instanceof RegExp)) {
        regex = new RegExp(regex.toString());
      }
      super(opts);
      __publicField(this, "regex");
      __publicField(this, "data");
      this.regex = regex;
      this.data = "";
    }
    _transform(chunk, encoding, cb) {
      const data = this.data + chunk;
      const parts = data.split(this.regex);
      this.data = parts.pop() || "";
      parts.forEach((part) => {
        this.push(part);
      });
      cb();
    }
    _flush(cb) {
      this.push(this.data);
      this.data = "";
      cb();
    }
  }
  dist$8.RegexParser = RegexParser;
  return dist$8;
}
var dist$7 = {};
var decoder = {};
var hasRequiredDecoder;
function requireDecoder() {
  if (hasRequiredDecoder) return decoder;
  hasRequiredDecoder = 1;
  Object.defineProperty(decoder, "__esModule", { value: true });
  decoder.SlipDecoder = void 0;
  const stream_1 = require$$0$2;
  class SlipDecoder extends stream_1.Transform {
    constructor(options = {}) {
      super(options);
      __publicField(this, "opts");
      __publicField(this, "buffer");
      __publicField(this, "escape");
      __publicField(this, "start");
      const { START, ESC = 219, END = 192, ESC_START, ESC_END = 220, ESC_ESC = 221 } = options;
      this.opts = {
        START,
        ESC,
        END,
        ESC_START,
        ESC_END,
        ESC_ESC
      };
      this.buffer = Buffer.alloc(0);
      this.escape = false;
      this.start = false;
    }
    _transform(chunk, encoding, cb) {
      for (let ndx = 0; ndx < chunk.length; ndx++) {
        let byte = chunk[ndx];
        if (byte === this.opts.START) {
          this.start = true;
          continue;
        } else if (void 0 == this.opts.START) {
          this.start = true;
        }
        if (this.escape) {
          if (byte === this.opts.ESC_START && this.opts.START) {
            byte = this.opts.START;
          } else if (byte === this.opts.ESC_ESC) {
            byte = this.opts.ESC;
          } else if (byte === this.opts.ESC_END) {
            byte = this.opts.END;
          } else {
            this.escape = false;
            this.push(this.buffer);
            this.buffer = Buffer.alloc(0);
          }
        } else {
          if (byte === this.opts.ESC) {
            this.escape = true;
            continue;
          }
          if (byte === this.opts.END) {
            this.push(this.buffer);
            this.buffer = Buffer.alloc(0);
            this.escape = false;
            this.start = false;
            continue;
          }
        }
        this.escape = false;
        if (this.start) {
          this.buffer = Buffer.concat([this.buffer, Buffer.from([byte])]);
        }
      }
      cb();
    }
    _flush(cb) {
      this.push(this.buffer);
      this.buffer = Buffer.alloc(0);
      cb();
    }
  }
  decoder.SlipDecoder = SlipDecoder;
  return decoder;
}
var encoder = {};
var hasRequiredEncoder;
function requireEncoder() {
  if (hasRequiredEncoder) return encoder;
  hasRequiredEncoder = 1;
  Object.defineProperty(encoder, "__esModule", { value: true });
  encoder.SlipEncoder = void 0;
  const stream_1 = require$$0$2;
  class SlipEncoder extends stream_1.Transform {
    constructor(options = {}) {
      super(options);
      __publicField(this, "opts");
      const { START, ESC = 219, END = 192, ESC_START, ESC_END = 220, ESC_ESC = 221, bluetoothQuirk = false } = options;
      this.opts = {
        START,
        ESC,
        END,
        ESC_START,
        ESC_END,
        ESC_ESC,
        bluetoothQuirk
      };
    }
    _transform(chunk, encoding, cb) {
      const chunkLength = chunk.length;
      if (this.opts.bluetoothQuirk && chunkLength === 0) {
        return cb();
      }
      const encoded = Buffer.alloc(chunkLength * 2 + 2);
      let j = 0;
      if (this.opts.bluetoothQuirk == true) {
        encoded[j++] = this.opts.END;
      }
      if (this.opts.START !== void 0) {
        encoded[j++] = this.opts.START;
      }
      for (let i = 0; i < chunkLength; i++) {
        let byte = chunk[i];
        if (byte === this.opts.START && this.opts.ESC_START) {
          encoded[j++] = this.opts.ESC;
          byte = this.opts.ESC_START;
        } else if (byte === this.opts.END) {
          encoded[j++] = this.opts.ESC;
          byte = this.opts.ESC_END;
        } else if (byte === this.opts.ESC) {
          encoded[j++] = this.opts.ESC;
          byte = this.opts.ESC_ESC;
        }
        encoded[j++] = byte;
      }
      encoded[j++] = this.opts.END;
      cb(null, encoded.slice(0, j));
    }
  }
  encoder.SlipEncoder = SlipEncoder;
  return encoder;
}
var hasRequiredDist$8;
function requireDist$8() {
  if (hasRequiredDist$8) return dist$7;
  hasRequiredDist$8 = 1;
  (function(exports) {
    var __createBinding = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(requireDecoder(), exports);
    __exportStar(requireEncoder(), exports);
  })(dist$7);
  return dist$7;
}
var dist$6 = {};
var utils = {};
var hasRequiredUtils;
function requireUtils() {
  if (hasRequiredUtils) return utils;
  hasRequiredUtils = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.convertHeaderBufferToObj = exports.HEADER_LENGTH = void 0;
    exports.HEADER_LENGTH = 6;
    const toOctetStr = (num) => {
      let str = Number(num).toString(2);
      while (str.length < 8) {
        str = `0${str}`;
      }
      return str;
    };
    const convertHeaderBufferToObj = (buf) => {
      const headerStr = Array.from(buf.slice(0, exports.HEADER_LENGTH)).reduce((accum, curr) => `${accum}${toOctetStr(curr)}`, "");
      const isVersion1 = headerStr.slice(0, 3) === "000";
      const versionNumber = isVersion1 ? 1 : "UNKNOWN_VERSION";
      const type = Number(headerStr[3]);
      const secondaryHeader = Number(headerStr[4]);
      const apid = parseInt(headerStr.slice(5, 16), 2);
      const sequenceFlags = parseInt(headerStr.slice(16, 18), 2);
      const packetName = parseInt(headerStr.slice(18, 32), 2);
      const dataLength = parseInt(headerStr.slice(-16), 2) + 1;
      return {
        versionNumber,
        identification: {
          apid,
          secondaryHeader,
          type
        },
        sequenceControl: {
          packetName,
          sequenceFlags
        },
        dataLength
      };
    };
    exports.convertHeaderBufferToObj = convertHeaderBufferToObj;
  })(utils);
  return utils;
}
var hasRequiredDist$7;
function requireDist$7() {
  if (hasRequiredDist$7) return dist$6;
  hasRequiredDist$7 = 1;
  Object.defineProperty(dist$6, "__esModule", { value: true });
  dist$6.SpacePacketParser = void 0;
  const stream_1 = require$$0$2;
  const utils_1 = requireUtils();
  class SpacePacketParser extends stream_1.Transform {
    /**
     * A Transform stream that accepts a stream of octet data and emits object representations of
     * CCSDS Space Packets once a packet has been completely received.
     * @param {Object} [options] Configuration options for the stream
     * @param {Number} options.timeCodeFieldLength The length of the time code field within the data
     * @param {Number} options.ancillaryDataFieldLength The length of the ancillary data field within the data
     */
    constructor(options = {}) {
      super({ ...options, objectMode: true });
      __publicField(this, "timeCodeFieldLength");
      __publicField(this, "ancillaryDataFieldLength");
      __publicField(this, "dataBuffer");
      __publicField(this, "headerBuffer");
      __publicField(this, "dataLength");
      __publicField(this, "expectingHeader");
      __publicField(this, "dataSlice");
      __publicField(this, "header");
      this.timeCodeFieldLength = options.timeCodeFieldLength || 0;
      this.ancillaryDataFieldLength = options.ancillaryDataFieldLength || 0;
      this.dataSlice = this.timeCodeFieldLength + this.ancillaryDataFieldLength;
      this.dataBuffer = Buffer.alloc(0);
      this.headerBuffer = Buffer.alloc(0);
      this.dataLength = 0;
      this.expectingHeader = true;
    }
    /**
     * Bundle the header, secondary header if present, and the data into a JavaScript object to emit.
     * If more data has been received past the current packet, begin the process of parsing the next
     * packet(s).
     */
    pushCompletedPacket() {
      if (!this.header) {
        throw new Error("Missing header");
      }
      const timeCode = Buffer.from(this.dataBuffer.slice(0, this.timeCodeFieldLength));
      const ancillaryData = Buffer.from(this.dataBuffer.slice(this.timeCodeFieldLength, this.timeCodeFieldLength + this.ancillaryDataFieldLength));
      const data = Buffer.from(this.dataBuffer.slice(this.dataSlice, this.dataLength));
      const completedPacket = {
        header: { ...this.header },
        data: data.toString()
      };
      if (timeCode.length > 0 || ancillaryData.length > 0) {
        completedPacket.secondaryHeader = {};
        if (timeCode.length) {
          completedPacket.secondaryHeader.timeCode = timeCode.toString();
        }
        if (ancillaryData.length) {
          completedPacket.secondaryHeader.ancillaryData = ancillaryData.toString();
        }
      }
      this.push(completedPacket);
      const nextChunk = Buffer.from(this.dataBuffer.slice(this.dataLength));
      if (nextChunk.length >= utils_1.HEADER_LENGTH) {
        this.extractHeader(nextChunk);
      } else {
        this.headerBuffer = nextChunk;
        this.dataBuffer = Buffer.alloc(0);
        this.expectingHeader = true;
        this.dataLength = 0;
        this.header = void 0;
      }
    }
    /**
     * Build the Stream's headerBuffer property from the received Buffer chunk; extract data from it
     * if it's complete. If there's more to the chunk than just the header, initiate handling the
     * packet data.
     * @param chunk -  Build the Stream's headerBuffer property from
     */
    extractHeader(chunk) {
      const headerAsBuffer = Buffer.concat([this.headerBuffer, chunk]);
      const startOfDataBuffer = headerAsBuffer.slice(utils_1.HEADER_LENGTH);
      if (headerAsBuffer.length >= utils_1.HEADER_LENGTH) {
        this.header = (0, utils_1.convertHeaderBufferToObj)(headerAsBuffer);
        this.dataLength = this.header.dataLength;
        this.headerBuffer = Buffer.alloc(0);
        this.expectingHeader = false;
      } else {
        this.headerBuffer = headerAsBuffer;
      }
      if (startOfDataBuffer.length > 0) {
        this.dataBuffer = Buffer.from(startOfDataBuffer);
        if (this.dataBuffer.length >= this.dataLength) {
          this.pushCompletedPacket();
        }
      }
    }
    _transform(chunk, encoding, cb) {
      if (this.expectingHeader) {
        this.extractHeader(chunk);
      } else {
        this.dataBuffer = Buffer.concat([this.dataBuffer, chunk]);
        if (this.dataBuffer.length >= this.dataLength) {
          this.pushCompletedPacket();
        }
      }
      cb();
    }
    _flush(cb) {
      const remaining = Buffer.concat([this.headerBuffer, this.dataBuffer]);
      const remainingArray = Array.from(remaining);
      this.push(remainingArray);
      cb();
    }
  }
  dist$6.SpacePacketParser = SpacePacketParser;
  return dist$6;
}
var serialportMock = {};
var dist$5 = {};
var src$1 = { exports: {} };
var browser$1 = { exports: {} };
var common$1;
var hasRequiredCommon$1;
function requireCommon$1() {
  if (hasRequiredCommon$1) return common$1;
  hasRequiredCommon$1 = 1;
  function setup(env) {
    createDebug.debug = createDebug;
    createDebug.default = createDebug;
    createDebug.coerce = coerce;
    createDebug.disable = disable;
    createDebug.enable = enable;
    createDebug.enabled = enabled;
    createDebug.humanize = requireMs();
    createDebug.destroy = destroy;
    Object.keys(env).forEach((key) => {
      createDebug[key] = env[key];
    });
    createDebug.names = [];
    createDebug.skips = [];
    createDebug.formatters = {};
    function selectColor(namespace) {
      let hash = 0;
      for (let i = 0; i < namespace.length; i++) {
        hash = (hash << 5) - hash + namespace.charCodeAt(i);
        hash |= 0;
      }
      return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
    }
    createDebug.selectColor = selectColor;
    function createDebug(namespace) {
      let prevTime;
      let enableOverride = null;
      let namespacesCache;
      let enabledCache;
      function debug(...args) {
        if (!debug.enabled) {
          return;
        }
        const self2 = debug;
        const curr = Number(/* @__PURE__ */ new Date());
        const ms2 = curr - (prevTime || curr);
        self2.diff = ms2;
        self2.prev = prevTime;
        self2.curr = curr;
        prevTime = curr;
        args[0] = createDebug.coerce(args[0]);
        if (typeof args[0] !== "string") {
          args.unshift("%O");
        }
        let index = 0;
        args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
          if (match === "%%") {
            return "%";
          }
          index++;
          const formatter = createDebug.formatters[format];
          if (typeof formatter === "function") {
            const val = args[index];
            match = formatter.call(self2, val);
            args.splice(index, 1);
            index--;
          }
          return match;
        });
        createDebug.formatArgs.call(self2, args);
        const logFn = self2.log || createDebug.log;
        logFn.apply(self2, args);
      }
      debug.namespace = namespace;
      debug.useColors = createDebug.useColors();
      debug.color = createDebug.selectColor(namespace);
      debug.extend = extend;
      debug.destroy = createDebug.destroy;
      Object.defineProperty(debug, "enabled", {
        enumerable: true,
        configurable: false,
        get: () => {
          if (enableOverride !== null) {
            return enableOverride;
          }
          if (namespacesCache !== createDebug.namespaces) {
            namespacesCache = createDebug.namespaces;
            enabledCache = createDebug.enabled(namespace);
          }
          return enabledCache;
        },
        set: (v) => {
          enableOverride = v;
        }
      });
      if (typeof createDebug.init === "function") {
        createDebug.init(debug);
      }
      return debug;
    }
    function extend(namespace, delimiter) {
      const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
      newDebug.log = this.log;
      return newDebug;
    }
    function enable(namespaces) {
      createDebug.save(namespaces);
      createDebug.namespaces = namespaces;
      createDebug.names = [];
      createDebug.skips = [];
      const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(" ", ",").split(",").filter(Boolean);
      for (const ns of split) {
        if (ns[0] === "-") {
          createDebug.skips.push(ns.slice(1));
        } else {
          createDebug.names.push(ns);
        }
      }
    }
    function matchesTemplate(search, template) {
      let searchIndex = 0;
      let templateIndex = 0;
      let starIndex = -1;
      let matchIndex = 0;
      while (searchIndex < search.length) {
        if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
          if (template[templateIndex] === "*") {
            starIndex = templateIndex;
            matchIndex = searchIndex;
            templateIndex++;
          } else {
            searchIndex++;
            templateIndex++;
          }
        } else if (starIndex !== -1) {
          templateIndex = starIndex + 1;
          matchIndex++;
          searchIndex = matchIndex;
        } else {
          return false;
        }
      }
      while (templateIndex < template.length && template[templateIndex] === "*") {
        templateIndex++;
      }
      return templateIndex === template.length;
    }
    function disable() {
      const namespaces = [
        ...createDebug.names,
        ...createDebug.skips.map((namespace) => "-" + namespace)
      ].join(",");
      createDebug.enable("");
      return namespaces;
    }
    function enabled(name2) {
      for (const skip of createDebug.skips) {
        if (matchesTemplate(name2, skip)) {
          return false;
        }
      }
      for (const ns of createDebug.names) {
        if (matchesTemplate(name2, ns)) {
          return true;
        }
      }
      return false;
    }
    function coerce(val) {
      if (val instanceof Error) {
        return val.stack || val.message;
      }
      return val;
    }
    function destroy() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    createDebug.enable(createDebug.load());
    return createDebug;
  }
  common$1 = setup;
  return common$1;
}
var hasRequiredBrowser$1;
function requireBrowser$1() {
  if (hasRequiredBrowser$1) return browser$1.exports;
  hasRequiredBrowser$1 = 1;
  (function(module, exports) {
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.storage = localstorage();
    exports.destroy = /* @__PURE__ */ (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      let m;
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args) {
      args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      let index = 0;
      let lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c);
    }
    exports.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports.storage.setItem("debug", namespaces);
        } else {
          exports.storage.removeItem("debug");
        }
      } catch (error) {
      }
    }
    function load() {
      let r;
      try {
        r = exports.storage.getItem("debug");
      } catch (error) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error) {
      }
    }
    module.exports = requireCommon$1()(exports);
    const { formatters } = module.exports;
    formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (error) {
        return "[UnexpectedJSONParseError]: " + error.message;
      }
    };
  })(browser$1, browser$1.exports);
  return browser$1.exports;
}
var node$1 = { exports: {} };
var hasRequiredNode$1;
function requireNode$1() {
  if (hasRequiredNode$1) return node$1.exports;
  hasRequiredNode$1 = 1;
  (function(module, exports) {
    const tty = require$$0;
    const util2 = require$$1$2;
    exports.init = init;
    exports.log = log;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.destroy = util2.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = requireSupportsColor();
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error) {
    }
    exports.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
        return k.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj[prop] = val;
      return obj;
    }, {});
    function useColors() {
      return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args) {
      const { namespace: name2, useColors: useColors2 } = this;
      if (useColors2) {
        const c = this.color;
        const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
        const prefix = `  ${colorCode};1m${name2} \x1B[0m`;
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = getDate() + name2 + " " + args[0];
      }
    }
    function getDate() {
      if (exports.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log(...args) {
      return process.stderr.write(util2.formatWithOptions(exports.inspectOpts, ...args) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function init(debug) {
      debug.inspectOpts = {};
      const keys = Object.keys(exports.inspectOpts);
      for (let i = 0; i < keys.length; i++) {
        debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
      }
    }
    module.exports = requireCommon$1()(exports);
    const { formatters } = module.exports;
    formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util2.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
    };
    formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util2.inspect(v, this.inspectOpts);
    };
  })(node$1, node$1.exports);
  return node$1.exports;
}
var hasRequiredSrc$1;
function requireSrc$1() {
  if (hasRequiredSrc$1) return src$1.exports;
  hasRequiredSrc$1 = 1;
  if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
    src$1.exports = requireBrowser$1();
  } else {
    src$1.exports = requireNode$1();
  }
  return src$1.exports;
}
var hasRequiredDist$6;
function requireDist$6() {
  if (hasRequiredDist$6) return dist$5;
  hasRequiredDist$6 = 1;
  var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(dist$5, "__esModule", { value: true });
  dist$5.SerialPortStream = dist$5.DisconnectedError = void 0;
  const stream_1 = require$$0$2;
  const debug_1 = __importDefault(requireSrc$1());
  const debug = (0, debug_1.default)("serialport/stream");
  class DisconnectedError extends Error {
    constructor(message) {
      super(message);
      __publicField(this, "disconnected");
      this.disconnected = true;
    }
  }
  dist$5.DisconnectedError = DisconnectedError;
  const defaultSetFlags = {
    brk: false,
    cts: false,
    dtr: true,
    rts: true
  };
  function allocNewReadPool(poolSize) {
    const pool = Buffer.allocUnsafe(poolSize);
    pool.used = 0;
    return pool;
  }
  class SerialPortStream extends stream_1.Duplex {
    /**
     * Create a new serial port object for the `path`. In the case of invalid arguments or invalid options, when constructing a new SerialPort it will throw an error. The port will open automatically by default, which is the equivalent of calling `port.open(openCallback)` in the next tick. You can disable this by setting the option `autoOpen` to `false`.
     * @emits open
     * @emits data
     * @emits close
     * @emits error
     */
    constructor(options, openCallback) {
      const settings = {
        autoOpen: true,
        endOnClose: false,
        highWaterMark: 64 * 1024,
        ...options
      };
      super({
        highWaterMark: settings.highWaterMark
      });
      __publicField(this, "port");
      __publicField(this, "_pool");
      __publicField(this, "_kMinPoolSpace");
      __publicField(this, "opening");
      __publicField(this, "closing");
      __publicField(this, "settings");
      if (!settings.binding) {
        throw new TypeError('"Bindings" is invalid pass it as `options.binding`');
      }
      if (!settings.path) {
        throw new TypeError(`"path" is not defined: ${settings.path}`);
      }
      if (typeof settings.baudRate !== "number") {
        throw new TypeError(`"baudRate" must be a number: ${settings.baudRate}`);
      }
      this.settings = settings;
      this.opening = false;
      this.closing = false;
      this._pool = allocNewReadPool(this.settings.highWaterMark);
      this._kMinPoolSpace = 128;
      if (this.settings.autoOpen) {
        this.open(openCallback);
      }
    }
    get path() {
      return this.settings.path;
    }
    get baudRate() {
      return this.settings.baudRate;
    }
    get isOpen() {
      var _a;
      return (((_a = this.port) == null ? void 0 : _a.isOpen) ?? false) && !this.closing;
    }
    _error(error, callback) {
      if (callback) {
        callback.call(this, error);
      } else {
        this.emit("error", error);
      }
    }
    _asyncError(error, callback) {
      process.nextTick(() => this._error(error, callback));
    }
    /**
     * Opens a connection to the given serial port.
     * @param {ErrorCallback=} openCallback - Called after a connection is opened. If this is not provided and an error occurs, it will be emitted on the port's `error` event.
     * @emits open
     */
    open(openCallback) {
      if (this.isOpen) {
        return this._asyncError(new Error("Port is already open"), openCallback);
      }
      if (this.opening) {
        return this._asyncError(new Error("Port is opening"), openCallback);
      }
      const { highWaterMark, binding, autoOpen, endOnClose, ...openOptions } = this.settings;
      this.opening = true;
      debug("opening", `path: ${this.path}`);
      this.settings.binding.open(openOptions).then((port) => {
        debug("opened", `path: ${this.path}`);
        this.port = port;
        this.opening = false;
        this.emit("open");
        if (openCallback) {
          openCallback.call(this, null);
        }
      }, (err) => {
        this.opening = false;
        debug("Binding #open had an error", err);
        this._error(err, openCallback);
      });
    }
    /**
     * Changes the baud rate for an open port. Emits an error or calls the callback if the baud rate isn't supported.
     * @param {object=} options Only supports `baudRate`.
     * @param {number=} [options.baudRate] The baud rate of the port to be opened. This should match one of the commonly available baud rates, such as 110, 300, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600, or 115200. Custom rates are supported best effort per platform. The device connected to the serial port is not guaranteed to support the requested baud rate, even if the port itself supports that baud rate.
     * @param {ErrorCallback=} [callback] Called once the port's baud rate changes. If `.update` is called without a callback, and there is an error, an error event is emitted.
     * @returns {undefined}
     */
    update(options, callback) {
      if (!this.isOpen || !this.port) {
        debug("update attempted, but port is not open");
        return this._asyncError(new Error("Port is not open"), callback);
      }
      debug("update", `baudRate: ${options.baudRate}`);
      this.port.update(options).then(() => {
        debug("binding.update", "finished");
        this.settings.baudRate = options.baudRate;
        if (callback) {
          callback.call(this, null);
        }
      }, (err) => {
        debug("binding.update", "error", err);
        return this._error(err, callback);
      });
    }
    write(data, encoding, callback) {
      if (Array.isArray(data)) {
        data = Buffer.from(data);
      }
      if (typeof encoding === "function") {
        return super.write(data, encoding);
      }
      return super.write(data, encoding, callback);
    }
    _write(data, encoding, callback) {
      if (!this.isOpen || !this.port) {
        this.once("open", () => {
          this._write(data, encoding, callback);
        });
        return;
      }
      debug("_write", `${data.length} bytes of data`);
      this.port.write(data).then(() => {
        debug("binding.write", "write finished");
        callback(null);
      }, (err) => {
        debug("binding.write", "error", err);
        if (!err.canceled) {
          this._disconnected(err);
        }
        callback(err);
      });
    }
    _writev(data, callback) {
      debug("_writev", `${data.length} chunks of data`);
      const dataV = data.map((write) => write.chunk);
      this._write(Buffer.concat(dataV), "binary", callback);
    }
    _read(bytesToRead) {
      if (!this.isOpen || !this.port) {
        debug("_read", "queueing _read for after open");
        this.once("open", () => {
          this._read(bytesToRead);
        });
        return;
      }
      if (!this._pool || this._pool.length - this._pool.used < this._kMinPoolSpace) {
        debug("_read", "discarding the read buffer pool because it is below kMinPoolSpace");
        this._pool = allocNewReadPool(this.settings.highWaterMark);
      }
      const pool = this._pool;
      const toRead = Math.min(pool.length - pool.used, bytesToRead);
      const start = pool.used;
      debug("_read", "reading", { start, toRead });
      this.port.read(pool, start, toRead).then(({ bytesRead }) => {
        debug("binding.read", "finished", { bytesRead });
        if (bytesRead === 0) {
          debug("binding.read", "Zero bytes read closing readable stream");
          this.push(null);
          return;
        }
        pool.used += bytesRead;
        this.push(pool.slice(start, start + bytesRead));
      }, (err) => {
        debug("binding.read", "error", err);
        if (!err.canceled) {
          this._disconnected(err);
        }
        this._read(bytesToRead);
      });
    }
    _disconnected(err) {
      if (!this.isOpen) {
        debug("disconnected aborted because already closed", err);
        return;
      }
      debug("disconnected", err);
      this.close(void 0, new DisconnectedError(err.message));
    }
    /**
     * Closes an open connection.
     *
     * If there are in progress writes when the port is closed the writes will error.
     * @param {ErrorCallback} callback Called once a connection is closed.
     * @param {Error} disconnectError used internally to propagate a disconnect error
     */
    close(callback, disconnectError = null) {
      if (!this.isOpen || !this.port) {
        debug("close attempted, but port is not open");
        return this._asyncError(new Error("Port is not open"), callback);
      }
      this.closing = true;
      debug("#close");
      this.port.close().then(() => {
        this.closing = false;
        debug("binding.close", "finished");
        this.emit("close", disconnectError);
        if (this.settings.endOnClose) {
          this.emit("end");
        }
        if (callback) {
          callback.call(this, disconnectError);
        }
      }, (err) => {
        this.closing = false;
        debug("binding.close", "had an error", err);
        return this._error(err, callback);
      });
    }
    /**
     * Set control flags on an open port. Uses [`SetCommMask`](https://msdn.microsoft.com/en-us/library/windows/desktop/aa363257(v=vs.85).aspx) for Windows and [`ioctl`](http://linux.die.net/man/4/tty_ioctl) for OS X and Linux.
     *
     * All options are operating system default when the port is opened. Every flag is set on each call to the provided or default values. If options isn't provided default options is used.
     */
    set(options, callback) {
      if (!this.isOpen || !this.port) {
        debug("set attempted, but port is not open");
        return this._asyncError(new Error("Port is not open"), callback);
      }
      const settings = { ...defaultSetFlags, ...options };
      debug("#set", settings);
      this.port.set(settings).then(() => {
        debug("binding.set", "finished");
        if (callback) {
          callback.call(this, null);
        }
      }, (err) => {
        debug("binding.set", "had an error", err);
        return this._error(err, callback);
      });
    }
    /**
     * Returns the control flags (CTS, DSR, DCD) on the open port.
     * Uses [`GetCommModemStatus`](https://msdn.microsoft.com/en-us/library/windows/desktop/aa363258(v=vs.85).aspx) for Windows and [`ioctl`](http://linux.die.net/man/4/tty_ioctl) for mac and linux.
     */
    get(callback) {
      if (!this.isOpen || !this.port) {
        debug("get attempted, but port is not open");
        return this._asyncError(new Error("Port is not open"), callback);
      }
      debug("#get");
      this.port.get().then((status) => {
        debug("binding.get", "finished");
        callback.call(this, null, status);
      }, (err) => {
        debug("binding.get", "had an error", err);
        return this._error(err, callback);
      });
    }
    /**
     * Flush discards data received but not read, and written but not transmitted by the operating system. For more technical details, see [`tcflush(fd, TCIOFLUSH)`](http://linux.die.net/man/3/tcflush) for Mac/Linux and [`FlushFileBuffers`](http://msdn.microsoft.com/en-us/library/windows/desktop/aa364439) for Windows.
     */
    flush(callback) {
      if (!this.isOpen || !this.port) {
        debug("flush attempted, but port is not open");
        return this._asyncError(new Error("Port is not open"), callback);
      }
      debug("#flush");
      this.port.flush().then(() => {
        debug("binding.flush", "finished");
        if (callback) {
          callback.call(this, null);
        }
      }, (err) => {
        debug("binding.flush", "had an error", err);
        return this._error(err, callback);
      });
    }
    /**
       * Waits until all output data is transmitted to the serial port. After any pending write has completed it calls [`tcdrain()`](http://linux.die.net/man/3/tcdrain) or [FlushFileBuffers()](https://msdn.microsoft.com/en-us/library/windows/desktop/aa364439(v=vs.85).aspx) to ensure it has been written to the device.
      * @example
      Write the `data` and wait until it has finished transmitting to the target serial port before calling the callback. This will queue until the port is open and writes are finished.
    
      ```js
      function writeAndDrain (data, callback) {
        port.write(data);
        port.drain(callback);
      }
      ```
      */
    drain(callback) {
      debug("drain");
      if (!this.isOpen || !this.port) {
        debug("drain queuing on port open");
        this.once("open", () => {
          this.drain(callback);
        });
        return;
      }
      this.port.drain().then(() => {
        debug("binding.drain", "finished");
        if (callback) {
          callback.call(this, null);
        }
      }, (err) => {
        debug("binding.drain", "had an error", err);
        return this._error(err, callback);
      });
    }
  }
  dist$5.SerialPortStream = SerialPortStream;
  return dist$5;
}
var dist$4 = {};
var src = { exports: {} };
var browser = { exports: {} };
var common;
var hasRequiredCommon;
function requireCommon() {
  if (hasRequiredCommon) return common;
  hasRequiredCommon = 1;
  function setup(env) {
    createDebug.debug = createDebug;
    createDebug.default = createDebug;
    createDebug.coerce = coerce;
    createDebug.disable = disable;
    createDebug.enable = enable;
    createDebug.enabled = enabled;
    createDebug.humanize = requireMs();
    createDebug.destroy = destroy;
    Object.keys(env).forEach((key) => {
      createDebug[key] = env[key];
    });
    createDebug.names = [];
    createDebug.skips = [];
    createDebug.formatters = {};
    function selectColor(namespace) {
      let hash = 0;
      for (let i = 0; i < namespace.length; i++) {
        hash = (hash << 5) - hash + namespace.charCodeAt(i);
        hash |= 0;
      }
      return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
    }
    createDebug.selectColor = selectColor;
    function createDebug(namespace) {
      let prevTime;
      let enableOverride = null;
      let namespacesCache;
      let enabledCache;
      function debug(...args) {
        if (!debug.enabled) {
          return;
        }
        const self2 = debug;
        const curr = Number(/* @__PURE__ */ new Date());
        const ms2 = curr - (prevTime || curr);
        self2.diff = ms2;
        self2.prev = prevTime;
        self2.curr = curr;
        prevTime = curr;
        args[0] = createDebug.coerce(args[0]);
        if (typeof args[0] !== "string") {
          args.unshift("%O");
        }
        let index = 0;
        args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
          if (match === "%%") {
            return "%";
          }
          index++;
          const formatter = createDebug.formatters[format];
          if (typeof formatter === "function") {
            const val = args[index];
            match = formatter.call(self2, val);
            args.splice(index, 1);
            index--;
          }
          return match;
        });
        createDebug.formatArgs.call(self2, args);
        const logFn = self2.log || createDebug.log;
        logFn.apply(self2, args);
      }
      debug.namespace = namespace;
      debug.useColors = createDebug.useColors();
      debug.color = createDebug.selectColor(namespace);
      debug.extend = extend;
      debug.destroy = createDebug.destroy;
      Object.defineProperty(debug, "enabled", {
        enumerable: true,
        configurable: false,
        get: () => {
          if (enableOverride !== null) {
            return enableOverride;
          }
          if (namespacesCache !== createDebug.namespaces) {
            namespacesCache = createDebug.namespaces;
            enabledCache = createDebug.enabled(namespace);
          }
          return enabledCache;
        },
        set: (v) => {
          enableOverride = v;
        }
      });
      if (typeof createDebug.init === "function") {
        createDebug.init(debug);
      }
      return debug;
    }
    function extend(namespace, delimiter) {
      const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
      newDebug.log = this.log;
      return newDebug;
    }
    function enable(namespaces) {
      createDebug.save(namespaces);
      createDebug.namespaces = namespaces;
      createDebug.names = [];
      createDebug.skips = [];
      const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
      for (const ns of split) {
        if (ns[0] === "-") {
          createDebug.skips.push(ns.slice(1));
        } else {
          createDebug.names.push(ns);
        }
      }
    }
    function matchesTemplate(search, template) {
      let searchIndex = 0;
      let templateIndex = 0;
      let starIndex = -1;
      let matchIndex = 0;
      while (searchIndex < search.length) {
        if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
          if (template[templateIndex] === "*") {
            starIndex = templateIndex;
            matchIndex = searchIndex;
            templateIndex++;
          } else {
            searchIndex++;
            templateIndex++;
          }
        } else if (starIndex !== -1) {
          templateIndex = starIndex + 1;
          matchIndex++;
          searchIndex = matchIndex;
        } else {
          return false;
        }
      }
      while (templateIndex < template.length && template[templateIndex] === "*") {
        templateIndex++;
      }
      return templateIndex === template.length;
    }
    function disable() {
      const namespaces = [
        ...createDebug.names,
        ...createDebug.skips.map((namespace) => "-" + namespace)
      ].join(",");
      createDebug.enable("");
      return namespaces;
    }
    function enabled(name2) {
      for (const skip of createDebug.skips) {
        if (matchesTemplate(name2, skip)) {
          return false;
        }
      }
      for (const ns of createDebug.names) {
        if (matchesTemplate(name2, ns)) {
          return true;
        }
      }
      return false;
    }
    function coerce(val) {
      if (val instanceof Error) {
        return val.stack || val.message;
      }
      return val;
    }
    function destroy() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    createDebug.enable(createDebug.load());
    return createDebug;
  }
  common = setup;
  return common;
}
var hasRequiredBrowser;
function requireBrowser() {
  if (hasRequiredBrowser) return browser.exports;
  hasRequiredBrowser = 1;
  (function(module, exports) {
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.storage = localstorage();
    exports.destroy = /* @__PURE__ */ (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      let m;
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args) {
      args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      let index = 0;
      let lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c);
    }
    exports.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports.storage.setItem("debug", namespaces);
        } else {
          exports.storage.removeItem("debug");
        }
      } catch (error) {
      }
    }
    function load() {
      let r;
      try {
        r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
      } catch (error) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error) {
      }
    }
    module.exports = requireCommon()(exports);
    const { formatters } = module.exports;
    formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (error) {
        return "[UnexpectedJSONParseError]: " + error.message;
      }
    };
  })(browser, browser.exports);
  return browser.exports;
}
var node = { exports: {} };
var hasRequiredNode;
function requireNode() {
  if (hasRequiredNode) return node.exports;
  hasRequiredNode = 1;
  (function(module, exports) {
    const tty = require$$0;
    const util2 = require$$1$2;
    exports.init = init;
    exports.log = log;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.destroy = util2.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = requireSupportsColor();
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error) {
    }
    exports.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
        return k.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj[prop] = val;
      return obj;
    }, {});
    function useColors() {
      return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args) {
      const { namespace: name2, useColors: useColors2 } = this;
      if (useColors2) {
        const c = this.color;
        const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
        const prefix = `  ${colorCode};1m${name2} \x1B[0m`;
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = getDate() + name2 + " " + args[0];
      }
    }
    function getDate() {
      if (exports.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log(...args) {
      return process.stderr.write(util2.formatWithOptions(exports.inspectOpts, ...args) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function init(debug) {
      debug.inspectOpts = {};
      const keys = Object.keys(exports.inspectOpts);
      for (let i = 0; i < keys.length; i++) {
        debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
      }
    }
    module.exports = requireCommon()(exports);
    const { formatters } = module.exports;
    formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util2.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
    };
    formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util2.inspect(v, this.inspectOpts);
    };
  })(node, node.exports);
  return node.exports;
}
var hasRequiredSrc;
function requireSrc() {
  if (hasRequiredSrc) return src.exports;
  hasRequiredSrc = 1;
  if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
    src.exports = requireBrowser();
  } else {
    src.exports = requireNode();
  }
  return src.exports;
}
var hasRequiredDist$5;
function requireDist$5() {
  if (hasRequiredDist$5) return dist$4;
  hasRequiredDist$5 = 1;
  Object.defineProperty(dist$4, "__esModule", { value: true });
  var debugFactory = requireSrc();
  function _interopDefaultLegacy(e) {
    return e && typeof e === "object" && "default" in e ? e : { "default": e };
  }
  var debugFactory__default = /* @__PURE__ */ _interopDefaultLegacy(debugFactory);
  const debug = debugFactory__default["default"]("serialport/binding-mock");
  let ports = {};
  let serialNumber = 0;
  function resolveNextTick() {
    return new Promise((resolve) => process.nextTick(() => resolve()));
  }
  class CanceledError extends Error {
    constructor(message) {
      super(message);
      this.canceled = true;
    }
  }
  const MockBinding = {
    reset() {
      ports = {};
      serialNumber = 0;
    },
    // Create a mock port
    createPort(path2, options = {}) {
      serialNumber++;
      const optWithDefaults = Object.assign({ echo: false, record: false, manufacturer: "The J5 Robotics Company", vendorId: void 0, productId: void 0, maxReadSize: 1024 }, options);
      ports[path2] = {
        data: Buffer.alloc(0),
        echo: optWithDefaults.echo,
        record: optWithDefaults.record,
        readyData: optWithDefaults.readyData,
        maxReadSize: optWithDefaults.maxReadSize,
        info: {
          path: path2,
          manufacturer: optWithDefaults.manufacturer,
          serialNumber: `${serialNumber}`,
          pnpId: void 0,
          locationId: void 0,
          vendorId: optWithDefaults.vendorId,
          productId: optWithDefaults.productId
        }
      };
      debug(serialNumber, "created port", JSON.stringify({ path: path2, opt: options }));
    },
    async list() {
      debug(null, "list");
      return Object.values(ports).map((port) => port.info);
    },
    async open(options) {
      var _a;
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new TypeError('"options" is not an object');
      }
      if (!options.path) {
        throw new TypeError('"path" is not a valid port');
      }
      if (!options.baudRate) {
        throw new TypeError('"baudRate" is not a valid baudRate');
      }
      const openOptions = Object.assign({ dataBits: 8, lock: true, stopBits: 1, parity: "none", rtscts: false, xon: false, xoff: false, xany: false, hupcl: true }, options);
      const { path: path2 } = openOptions;
      debug(null, `open: opening path ${path2}`);
      const port = ports[path2];
      await resolveNextTick();
      if (!port) {
        throw new Error(`Port does not exist - please call MockBinding.createPort('${path2}') first`);
      }
      const serialNumber2 = port.info.serialNumber;
      if ((_a = port.openOpt) === null || _a === void 0 ? void 0 : _a.lock) {
        debug(serialNumber2, "open: Port is locked cannot open");
        throw new Error("Port is locked cannot open");
      }
      debug(serialNumber2, `open: opened path ${path2}`);
      port.openOpt = Object.assign({}, openOptions);
      return new MockPortBinding(port, openOptions);
    }
  };
  class MockPortBinding {
    constructor(port, openOptions) {
      this.port = port;
      this.openOptions = openOptions;
      this.pendingRead = null;
      this.isOpen = true;
      this.lastWrite = null;
      this.recording = Buffer.alloc(0);
      this.writeOperation = null;
      this.serialNumber = port.info.serialNumber;
      if (port.readyData) {
        const data = port.readyData;
        process.nextTick(() => {
          if (this.isOpen) {
            debug(this.serialNumber, "emitting ready data");
            this.emitData(data);
          }
        });
      }
    }
    // Emit data on a mock port
    emitData(data) {
      if (!this.isOpen || !this.port) {
        throw new Error("Port must be open to pretend to receive data");
      }
      const bufferData = Buffer.isBuffer(data) ? data : Buffer.from(data);
      debug(this.serialNumber, "emitting data - pending read:", Boolean(this.pendingRead));
      this.port.data = Buffer.concat([this.port.data, bufferData]);
      if (this.pendingRead) {
        process.nextTick(this.pendingRead);
        this.pendingRead = null;
      }
    }
    async close() {
      debug(this.serialNumber, "close");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      const port = this.port;
      if (!port) {
        throw new Error("already closed");
      }
      port.openOpt = void 0;
      port.data = Buffer.alloc(0);
      debug(this.serialNumber, "port is closed");
      this.serialNumber = void 0;
      this.isOpen = false;
      if (this.pendingRead) {
        this.pendingRead(new CanceledError("port is closed"));
      }
    }
    async read(buffer, offset, length) {
      if (!Buffer.isBuffer(buffer)) {
        throw new TypeError('"buffer" is not a Buffer');
      }
      if (typeof offset !== "number" || isNaN(offset)) {
        throw new TypeError(`"offset" is not an integer got "${isNaN(offset) ? "NaN" : typeof offset}"`);
      }
      if (typeof length !== "number" || isNaN(length)) {
        throw new TypeError(`"length" is not an integer got "${isNaN(length) ? "NaN" : typeof length}"`);
      }
      if (buffer.length < offset + length) {
        throw new Error("buffer is too small");
      }
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      debug(this.serialNumber, "read", length, "bytes");
      await resolveNextTick();
      if (!this.isOpen || !this.port) {
        throw new CanceledError("Read canceled");
      }
      if (this.port.data.length <= 0) {
        return new Promise((resolve, reject) => {
          this.pendingRead = (err) => {
            if (err) {
              return reject(err);
            }
            this.read(buffer, offset, length).then(resolve, reject);
          };
        });
      }
      const lengthToRead = this.port.maxReadSize > length ? length : this.port.maxReadSize;
      const data = this.port.data.slice(0, lengthToRead);
      const bytesRead = data.copy(buffer, offset);
      this.port.data = this.port.data.slice(lengthToRead);
      debug(this.serialNumber, "read", bytesRead, "bytes");
      return { bytesRead, buffer };
    }
    async write(buffer) {
      if (!Buffer.isBuffer(buffer)) {
        throw new TypeError('"buffer" is not a Buffer');
      }
      if (!this.isOpen || !this.port) {
        debug("write", "error port is not open");
        throw new Error("Port is not open");
      }
      debug(this.serialNumber, "write", buffer.length, "bytes");
      if (this.writeOperation) {
        throw new Error("Overlapping writes are not supported and should be queued by the serialport object");
      }
      this.writeOperation = (async () => {
        await resolveNextTick();
        if (!this.isOpen || !this.port) {
          throw new Error("Write canceled");
        }
        const data = this.lastWrite = Buffer.from(buffer);
        if (this.port.record) {
          this.recording = Buffer.concat([this.recording, data]);
        }
        if (this.port.echo) {
          process.nextTick(() => {
            if (this.isOpen) {
              this.emitData(data);
            }
          });
        }
        this.writeOperation = null;
        debug(this.serialNumber, "writing finished");
      })();
      return this.writeOperation;
    }
    async update(options) {
      if (typeof options !== "object") {
        throw TypeError('"options" is not an object');
      }
      if (typeof options.baudRate !== "number") {
        throw new TypeError('"options.baudRate" is not a number');
      }
      debug(this.serialNumber, "update");
      if (!this.isOpen || !this.port) {
        throw new Error("Port is not open");
      }
      await resolveNextTick();
      if (this.port.openOpt) {
        this.port.openOpt.baudRate = options.baudRate;
      }
    }
    async set(options) {
      if (typeof options !== "object") {
        throw new TypeError('"options" is not an object');
      }
      debug(this.serialNumber, "set");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await resolveNextTick();
    }
    async get() {
      debug(this.serialNumber, "get");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await resolveNextTick();
      return {
        cts: true,
        dsr: false,
        dcd: false
      };
    }
    async getBaudRate() {
      var _a;
      debug(this.serialNumber, "getBaudRate");
      if (!this.isOpen || !this.port) {
        throw new Error("Port is not open");
      }
      await resolveNextTick();
      if (!((_a = this.port.openOpt) === null || _a === void 0 ? void 0 : _a.baudRate)) {
        throw new Error("Internal Error");
      }
      return {
        baudRate: this.port.openOpt.baudRate
      };
    }
    async flush() {
      debug(this.serialNumber, "flush");
      if (!this.isOpen || !this.port) {
        throw new Error("Port is not open");
      }
      await resolveNextTick();
      this.port.data = Buffer.alloc(0);
    }
    async drain() {
      debug(this.serialNumber, "drain");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await this.writeOperation;
      await resolveNextTick();
    }
  }
  dist$4.CanceledError = CanceledError;
  dist$4.MockBinding = MockBinding;
  dist$4.MockPortBinding = MockPortBinding;
  return dist$4;
}
var hasRequiredSerialportMock;
function requireSerialportMock() {
  if (hasRequiredSerialportMock) return serialportMock;
  hasRequiredSerialportMock = 1;
  Object.defineProperty(serialportMock, "__esModule", { value: true });
  serialportMock.SerialPortMock = void 0;
  const stream_1 = requireDist$6();
  const binding_mock_1 = requireDist$5();
  class SerialPortMock extends stream_1.SerialPortStream {
    constructor(options, openCallback) {
      const opts = {
        binding: binding_mock_1.MockBinding,
        ...options
      };
      super(opts, openCallback);
    }
  }
  __publicField(SerialPortMock, "list", binding_mock_1.MockBinding.list);
  __publicField(SerialPortMock, "binding", binding_mock_1.MockBinding);
  serialportMock.SerialPortMock = SerialPortMock;
  return serialportMock;
}
var serialport = {};
var dist$3 = {};
var darwin = {};
var loadBindings = {};
var serialportBindings = {};
function commonjsRequire(path2) {
  throw new Error('Could not dynamically require "' + path2 + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
}
var nodeGypBuild$1 = { exports: {} };
var nodeGypBuild;
var hasRequiredNodeGypBuild$1;
function requireNodeGypBuild$1() {
  if (hasRequiredNodeGypBuild$1) return nodeGypBuild;
  hasRequiredNodeGypBuild$1 = 1;
  var fs$1 = fs;
  var path2 = require$$1$3;
  var os = require$$0$1;
  var runtimeRequire = typeof __webpack_require__ === "function" ? __non_webpack_require__ : commonjsRequire;
  var vars = process.config && process.config.variables || {};
  var prebuildsOnly = !!process.env.PREBUILDS_ONLY;
  var abi = process.versions.modules;
  var runtime = isElectron() ? "electron" : isNwjs() ? "node-webkit" : "node";
  var arch = process.env.npm_config_arch || os.arch();
  var platform = process.env.npm_config_platform || os.platform();
  var libc = process.env.LIBC || (isAlpine(platform) ? "musl" : "glibc");
  var armv = process.env.ARM_VERSION || (arch === "arm64" ? "8" : vars.arm_version) || "";
  var uv = (process.versions.uv || "").split(".")[0];
  nodeGypBuild = load;
  function load(dir) {
    return runtimeRequire(load.resolve(dir));
  }
  load.resolve = load.path = function(dir) {
    dir = path2.resolve(dir || ".");
    try {
      var name2 = runtimeRequire(path2.join(dir, "package.json")).name.toUpperCase().replace(/-/g, "_");
      if (process.env[name2 + "_PREBUILD"]) dir = process.env[name2 + "_PREBUILD"];
    } catch (err) {
    }
    if (!prebuildsOnly) {
      var release = getFirst(path2.join(dir, "build/Release"), matchBuild);
      if (release) return release;
      var debug = getFirst(path2.join(dir, "build/Debug"), matchBuild);
      if (debug) return debug;
    }
    var prebuild = resolve(dir);
    if (prebuild) return prebuild;
    var nearby = resolve(path2.dirname(process.execPath));
    if (nearby) return nearby;
    var target = [
      "platform=" + platform,
      "arch=" + arch,
      "runtime=" + runtime,
      "abi=" + abi,
      "uv=" + uv,
      armv ? "armv=" + armv : "",
      "libc=" + libc,
      "node=" + process.versions.node,
      process.versions.electron ? "electron=" + process.versions.electron : "",
      typeof __webpack_require__ === "function" ? "webpack=true" : ""
      // eslint-disable-line
    ].filter(Boolean).join(" ");
    throw new Error("No native build was found for " + target + "\n    loaded from: " + dir + "\n");
    function resolve(dir2) {
      var tuples = readdirSync(path2.join(dir2, "prebuilds")).map(parseTuple);
      var tuple = tuples.filter(matchTuple(platform, arch)).sort(compareTuples)[0];
      if (!tuple) return;
      var prebuilds = path2.join(dir2, "prebuilds", tuple.name);
      var parsed = readdirSync(prebuilds).map(parseTags);
      var candidates = parsed.filter(matchTags(runtime, abi));
      var winner = candidates.sort(compareTags(runtime))[0];
      if (winner) return path2.join(prebuilds, winner.file);
    }
  };
  function readdirSync(dir) {
    try {
      return fs$1.readdirSync(dir);
    } catch (err) {
      return [];
    }
  }
  function getFirst(dir, filter) {
    var files2 = readdirSync(dir).filter(filter);
    return files2[0] && path2.join(dir, files2[0]);
  }
  function matchBuild(name2) {
    return /\.node$/.test(name2);
  }
  function parseTuple(name2) {
    var arr = name2.split("-");
    if (arr.length !== 2) return;
    var platform2 = arr[0];
    var architectures = arr[1].split("+");
    if (!platform2) return;
    if (!architectures.length) return;
    if (!architectures.every(Boolean)) return;
    return { name: name2, platform: platform2, architectures };
  }
  function matchTuple(platform2, arch2) {
    return function(tuple) {
      if (tuple == null) return false;
      if (tuple.platform !== platform2) return false;
      return tuple.architectures.includes(arch2);
    };
  }
  function compareTuples(a, b) {
    return a.architectures.length - b.architectures.length;
  }
  function parseTags(file) {
    var arr = file.split(".");
    var extension = arr.pop();
    var tags = { file, specificity: 0 };
    if (extension !== "node") return;
    for (var i = 0; i < arr.length; i++) {
      var tag = arr[i];
      if (tag === "node" || tag === "electron" || tag === "node-webkit") {
        tags.runtime = tag;
      } else if (tag === "napi") {
        tags.napi = true;
      } else if (tag.slice(0, 3) === "abi") {
        tags.abi = tag.slice(3);
      } else if (tag.slice(0, 2) === "uv") {
        tags.uv = tag.slice(2);
      } else if (tag.slice(0, 4) === "armv") {
        tags.armv = tag.slice(4);
      } else if (tag === "glibc" || tag === "musl") {
        tags.libc = tag;
      } else {
        continue;
      }
      tags.specificity++;
    }
    return tags;
  }
  function matchTags(runtime2, abi2) {
    return function(tags) {
      if (tags == null) return false;
      if (tags.runtime && tags.runtime !== runtime2 && !runtimeAgnostic(tags)) return false;
      if (tags.abi && tags.abi !== abi2 && !tags.napi) return false;
      if (tags.uv && tags.uv !== uv) return false;
      if (tags.armv && tags.armv !== armv) return false;
      if (tags.libc && tags.libc !== libc) return false;
      return true;
    };
  }
  function runtimeAgnostic(tags) {
    return tags.runtime === "node" && tags.napi;
  }
  function compareTags(runtime2) {
    return function(a, b) {
      if (a.runtime !== b.runtime) {
        return a.runtime === runtime2 ? -1 : 1;
      } else if (a.abi !== b.abi) {
        return a.abi ? -1 : 1;
      } else if (a.specificity !== b.specificity) {
        return a.specificity > b.specificity ? -1 : 1;
      } else {
        return 0;
      }
    };
  }
  function isNwjs() {
    return !!(process.versions && process.versions.nw);
  }
  function isElectron() {
    if (process.versions && process.versions.electron) return true;
    if (process.env.ELECTRON_RUN_AS_NODE) return true;
    return typeof window !== "undefined" && window.process && window.process.type === "renderer";
  }
  function isAlpine(platform2) {
    return platform2 === "linux" && fs$1.existsSync("/etc/alpine-release");
  }
  load.parseTags = parseTags;
  load.matchTags = matchTags;
  load.compareTags = compareTags;
  load.parseTuple = parseTuple;
  load.matchTuple = matchTuple;
  load.compareTuples = compareTuples;
  return nodeGypBuild;
}
var hasRequiredNodeGypBuild;
function requireNodeGypBuild() {
  if (hasRequiredNodeGypBuild) return nodeGypBuild$1.exports;
  hasRequiredNodeGypBuild = 1;
  const runtimeRequire = typeof __webpack_require__ === "function" ? __non_webpack_require__ : commonjsRequire;
  if (typeof runtimeRequire.addon === "function") {
    nodeGypBuild$1.exports = runtimeRequire.addon.bind(runtimeRequire);
  } else {
    nodeGypBuild$1.exports = requireNodeGypBuild$1();
  }
  return nodeGypBuild$1.exports;
}
var hasRequiredSerialportBindings;
function requireSerialportBindings() {
  if (hasRequiredSerialportBindings) return serialportBindings;
  hasRequiredSerialportBindings = 1;
  var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(serialportBindings, "__esModule", { value: true });
  serialportBindings.binding = void 0;
  const path_1 = require$$1$3;
  const node_gyp_build_1 = __importDefault(requireNodeGypBuild());
  serialportBindings.binding = (0, node_gyp_build_1.default)((0, path_1.join)(__dirname, "../"));
  return serialportBindings;
}
var hasRequiredLoadBindings;
function requireLoadBindings() {
  if (hasRequiredLoadBindings) return loadBindings;
  hasRequiredLoadBindings = 1;
  Object.defineProperty(loadBindings, "__esModule", { value: true });
  loadBindings.asyncWrite = loadBindings.asyncRead = loadBindings.asyncUpdate = loadBindings.asyncSet = loadBindings.asyncOpen = loadBindings.asyncList = loadBindings.asyncGetBaudRate = loadBindings.asyncGet = loadBindings.asyncFlush = loadBindings.asyncDrain = loadBindings.asyncClose = void 0;
  const util_1 = require$$1$2;
  const serialport_bindings_1 = requireSerialportBindings();
  loadBindings.asyncClose = serialport_bindings_1.binding.close ? (0, util_1.promisify)(serialport_bindings_1.binding.close) : async () => {
    throw new Error('"binding.close" Method not implemented');
  };
  loadBindings.asyncDrain = serialport_bindings_1.binding.drain ? (0, util_1.promisify)(serialport_bindings_1.binding.drain) : async () => {
    throw new Error('"binding.drain" Method not implemented');
  };
  loadBindings.asyncFlush = serialport_bindings_1.binding.flush ? (0, util_1.promisify)(serialport_bindings_1.binding.flush) : async () => {
    throw new Error('"binding.flush" Method not implemented');
  };
  loadBindings.asyncGet = serialport_bindings_1.binding.get ? (0, util_1.promisify)(serialport_bindings_1.binding.get) : async () => {
    throw new Error('"binding.get" Method not implemented');
  };
  loadBindings.asyncGetBaudRate = serialport_bindings_1.binding.getBaudRate ? (0, util_1.promisify)(serialport_bindings_1.binding.getBaudRate) : async () => {
    throw new Error('"binding.getBaudRate" Method not implemented');
  };
  loadBindings.asyncList = serialport_bindings_1.binding.list ? (0, util_1.promisify)(serialport_bindings_1.binding.list) : async () => {
    throw new Error('"binding.list" Method not implemented');
  };
  loadBindings.asyncOpen = serialport_bindings_1.binding.open ? (0, util_1.promisify)(serialport_bindings_1.binding.open) : async () => {
    throw new Error('"binding.open" Method not implemented');
  };
  loadBindings.asyncSet = serialport_bindings_1.binding.set ? (0, util_1.promisify)(serialport_bindings_1.binding.set) : async () => {
    throw new Error('"binding.set" Method not implemented');
  };
  loadBindings.asyncUpdate = serialport_bindings_1.binding.update ? (0, util_1.promisify)(serialport_bindings_1.binding.update) : async () => {
    throw new Error('"binding.update" Method not implemented');
  };
  loadBindings.asyncRead = serialport_bindings_1.binding.read ? (0, util_1.promisify)(serialport_bindings_1.binding.read) : async () => {
    throw new Error('"binding.read" Method not implemented');
  };
  loadBindings.asyncWrite = serialport_bindings_1.binding.write ? (0, util_1.promisify)(serialport_bindings_1.binding.write) : async () => {
    throw new Error('"binding.write" Method not implemented');
  };
  return loadBindings;
}
var poller = {};
var errors = {};
var hasRequiredErrors;
function requireErrors() {
  if (hasRequiredErrors) return errors;
  hasRequiredErrors = 1;
  Object.defineProperty(errors, "__esModule", { value: true });
  errors.BindingsError = void 0;
  class BindingsError extends Error {
    constructor(message, { canceled = false } = {}) {
      super(message);
      this.canceled = canceled;
    }
  }
  errors.BindingsError = BindingsError;
  return errors;
}
var hasRequiredPoller;
function requirePoller() {
  if (hasRequiredPoller) return poller;
  hasRequiredPoller = 1;
  (function(exports) {
    var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Poller = exports.EVENTS = void 0;
    const debug_1 = __importDefault(requireSrc$1());
    const events_1 = require$$0$3;
    const errors_1 = requireErrors();
    const serialport_bindings_1 = requireSerialportBindings();
    const { Poller: PollerBindings } = serialport_bindings_1.binding;
    const logger = (0, debug_1.default)("serialport/bindings-cpp/poller");
    exports.EVENTS = {
      UV_READABLE: 1,
      UV_WRITABLE: 2,
      UV_DISCONNECT: 4
    };
    function handleEvent(error, eventFlag) {
      if (error) {
        logger("error", error);
        this.emit("readable", error);
        this.emit("writable", error);
        this.emit("disconnect", error);
        return;
      }
      if (eventFlag & exports.EVENTS.UV_READABLE) {
        logger('received "readable"');
        this.emit("readable", null);
      }
      if (eventFlag & exports.EVENTS.UV_WRITABLE) {
        logger('received "writable"');
        this.emit("writable", null);
      }
      if (eventFlag & exports.EVENTS.UV_DISCONNECT) {
        logger('received "disconnect"');
        this.emit("disconnect", null);
      }
    }
    class Poller extends events_1.EventEmitter {
      constructor(fd, FDPoller = PollerBindings) {
        logger("Creating poller");
        super();
        this.poller = new FDPoller(fd, handleEvent.bind(this));
      }
      /**
       * Wait for the next event to occur
       * @param {string} event ('readable'|'writable'|'disconnect')
       * @returns {Poller} returns itself
       */
      once(event, callback) {
        switch (event) {
          case "readable":
            this.poll(exports.EVENTS.UV_READABLE);
            break;
          case "writable":
            this.poll(exports.EVENTS.UV_WRITABLE);
            break;
          case "disconnect":
            this.poll(exports.EVENTS.UV_DISCONNECT);
            break;
        }
        return super.once(event, callback);
      }
      /**
       * Ask the bindings to listen for an event, it is recommend to use `.once()` for easy use
       * @param {EVENTS} eventFlag polls for an event or group of events based upon a flag.
       */
      poll(eventFlag = 0) {
        if (eventFlag & exports.EVENTS.UV_READABLE) {
          logger('Polling for "readable"');
        }
        if (eventFlag & exports.EVENTS.UV_WRITABLE) {
          logger('Polling for "writable"');
        }
        if (eventFlag & exports.EVENTS.UV_DISCONNECT) {
          logger('Polling for "disconnect"');
        }
        this.poller.poll(eventFlag);
      }
      /**
       * Stop listening for events and cancel all outstanding listening with an error
       */
      stop() {
        logger("Stopping poller");
        this.poller.stop();
        this.emitCanceled();
      }
      destroy() {
        logger("Destroying poller");
        this.poller.destroy();
        this.emitCanceled();
      }
      emitCanceled() {
        const err = new errors_1.BindingsError("Canceled", { canceled: true });
        this.emit("readable", err);
        this.emit("writable", err);
        this.emit("disconnect", err);
      }
    }
    exports.Poller = Poller;
  })(poller);
  return poller;
}
var unixRead = {};
var hasRequiredUnixRead;
function requireUnixRead() {
  if (hasRequiredUnixRead) return unixRead;
  hasRequiredUnixRead = 1;
  (function(exports) {
    var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.unixRead = void 0;
    const util_1 = require$$1$2;
    const fs_1 = fs;
    const errors_1 = requireErrors();
    const debug_1 = __importDefault(requireSrc$1());
    const logger = (0, debug_1.default)("serialport/bindings-cpp/unixRead");
    const readAsync = (0, util_1.promisify)(fs_1.read);
    const readable = (binding) => {
      return new Promise((resolve, reject) => {
        if (!binding.poller) {
          throw new Error("No poller on bindings");
        }
        binding.poller.once("readable", (err) => err ? reject(err) : resolve());
      });
    };
    const unixRead2 = async ({ binding, buffer, offset, length, fsReadAsync = readAsync }) => {
      logger("Starting read");
      if (!binding.isOpen || !binding.fd) {
        throw new errors_1.BindingsError("Port is not open", { canceled: true });
      }
      try {
        const { bytesRead } = await fsReadAsync(binding.fd, buffer, offset, length, null);
        if (bytesRead === 0) {
          return (0, exports.unixRead)({ binding, buffer, offset, length, fsReadAsync });
        }
        logger("Finished read", bytesRead, "bytes");
        return { bytesRead, buffer };
      } catch (err) {
        logger("read error", err);
        if (err.code === "EAGAIN" || err.code === "EWOULDBLOCK" || err.code === "EINTR") {
          if (!binding.isOpen) {
            throw new errors_1.BindingsError("Port is not open", { canceled: true });
          }
          logger("waiting for readable because of code:", err.code);
          await readable(binding);
          return (0, exports.unixRead)({ binding, buffer, offset, length, fsReadAsync });
        }
        const disconnectError = err.code === "EBADF" || // Bad file number means we got closed
        err.code === "ENXIO" || // No such device or address probably usb disconnect
        err.code === "UNKNOWN" || err.errno === -1;
        if (disconnectError) {
          err.disconnect = true;
          logger("disconnecting", err);
        }
        throw err;
      }
    };
    exports.unixRead = unixRead2;
  })(unixRead);
  return unixRead;
}
var unixWrite = {};
var hasRequiredUnixWrite;
function requireUnixWrite() {
  if (hasRequiredUnixWrite) return unixWrite;
  hasRequiredUnixWrite = 1;
  (function(exports) {
    var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.unixWrite = void 0;
    const fs_1 = fs;
    const debug_1 = __importDefault(requireSrc$1());
    const util_1 = require$$1$2;
    const logger = (0, debug_1.default)("serialport/bindings-cpp/unixWrite");
    const writeAsync = (0, util_1.promisify)(fs_1.write);
    const writable = (binding) => {
      return new Promise((resolve, reject) => {
        binding.poller.once("writable", (err) => err ? reject(err) : resolve());
      });
    };
    const unixWrite2 = async ({ binding, buffer, offset = 0, fsWriteAsync = writeAsync }) => {
      const bytesToWrite = buffer.length - offset;
      logger("Starting write", buffer.length, "bytes offset", offset, "bytesToWrite", bytesToWrite);
      if (!binding.isOpen || !binding.fd) {
        throw new Error("Port is not open");
      }
      try {
        const { bytesWritten } = await fsWriteAsync(binding.fd, buffer, offset, bytesToWrite);
        logger("write returned: wrote", bytesWritten, "bytes");
        if (bytesWritten + offset < buffer.length) {
          if (!binding.isOpen) {
            throw new Error("Port is not open");
          }
          return (0, exports.unixWrite)({ binding, buffer, offset: bytesWritten + offset, fsWriteAsync });
        }
        logger("Finished writing", bytesWritten + offset, "bytes");
      } catch (err) {
        logger("write errored", err);
        if (err.code === "EAGAIN" || err.code === "EWOULDBLOCK" || err.code === "EINTR") {
          if (!binding.isOpen) {
            throw new Error("Port is not open");
          }
          logger("waiting for writable because of code:", err.code);
          await writable(binding);
          return (0, exports.unixWrite)({ binding, buffer, offset, fsWriteAsync });
        }
        const disconnectError = err.code === "EBADF" || // Bad file number means we got closed
        err.code === "ENXIO" || // No such device or address probably usb disconnect
        err.code === "UNKNOWN" || err.errno === -1;
        if (disconnectError) {
          err.disconnect = true;
          logger("disconnecting", err);
        }
        logger("error", err);
        throw err;
      }
    };
    exports.unixWrite = unixWrite2;
  })(unixWrite);
  return unixWrite;
}
var hasRequiredDarwin;
function requireDarwin() {
  if (hasRequiredDarwin) return darwin;
  hasRequiredDarwin = 1;
  var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(darwin, "__esModule", { value: true });
  darwin.DarwinPortBinding = darwin.DarwinBinding = void 0;
  const debug_1 = __importDefault(requireSrc$1());
  const load_bindings_1 = requireLoadBindings();
  const poller_1 = requirePoller();
  const unix_read_1 = requireUnixRead();
  const unix_write_1 = requireUnixWrite();
  const debug = (0, debug_1.default)("serialport/bindings-cpp");
  darwin.DarwinBinding = {
    list() {
      debug("list");
      return (0, load_bindings_1.asyncList)();
    },
    async open(options) {
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new TypeError('"options" is not an object');
      }
      if (!options.path) {
        throw new TypeError('"path" is not a valid port');
      }
      if (!options.baudRate) {
        throw new TypeError('"baudRate" is not a valid baudRate');
      }
      debug("open");
      const openOptions = Object.assign({ vmin: 1, vtime: 0, dataBits: 8, lock: true, stopBits: 1, parity: "none", rtscts: false, xon: false, xoff: false, xany: false, hupcl: true }, options);
      const fd = await (0, load_bindings_1.asyncOpen)(openOptions.path, openOptions);
      return new DarwinPortBinding(fd, openOptions);
    }
  };
  class DarwinPortBinding {
    constructor(fd, options) {
      this.fd = fd;
      this.openOptions = options;
      this.poller = new poller_1.Poller(fd);
      this.writeOperation = null;
    }
    get isOpen() {
      return this.fd !== null;
    }
    async close() {
      debug("close");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      const fd = this.fd;
      this.poller.stop();
      this.poller.destroy();
      this.fd = null;
      await (0, load_bindings_1.asyncClose)(fd);
    }
    async read(buffer, offset, length) {
      if (!Buffer.isBuffer(buffer)) {
        throw new TypeError('"buffer" is not a Buffer');
      }
      if (typeof offset !== "number" || isNaN(offset)) {
        throw new TypeError(`"offset" is not an integer got "${isNaN(offset) ? "NaN" : typeof offset}"`);
      }
      if (typeof length !== "number" || isNaN(length)) {
        throw new TypeError(`"length" is not an integer got "${isNaN(length) ? "NaN" : typeof length}"`);
      }
      debug("read");
      if (buffer.length < offset + length) {
        throw new Error("buffer is too small");
      }
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      return (0, unix_read_1.unixRead)({ binding: this, buffer, offset, length });
    }
    async write(buffer) {
      if (!Buffer.isBuffer(buffer)) {
        throw new TypeError('"buffer" is not a Buffer');
      }
      debug("write", buffer.length, "bytes");
      if (!this.isOpen) {
        debug("write", "error port is not open");
        throw new Error("Port is not open");
      }
      this.writeOperation = (async () => {
        if (buffer.length === 0) {
          return;
        }
        await (0, unix_write_1.unixWrite)({ binding: this, buffer });
        this.writeOperation = null;
      })();
      return this.writeOperation;
    }
    async update(options) {
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw TypeError('"options" is not an object');
      }
      if (typeof options.baudRate !== "number") {
        throw new TypeError('"options.baudRate" is not a number');
      }
      debug("update");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await (0, load_bindings_1.asyncUpdate)(this.fd, options);
    }
    async set(options) {
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new TypeError('"options" is not an object');
      }
      debug("set", options);
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await (0, load_bindings_1.asyncSet)(this.fd, options);
    }
    async get() {
      debug("get");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      return (0, load_bindings_1.asyncGet)(this.fd);
    }
    async getBaudRate() {
      debug("getBaudRate");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      throw new Error("getBaudRate is not implemented on darwin");
    }
    async flush() {
      debug("flush");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await (0, load_bindings_1.asyncFlush)(this.fd);
    }
    async drain() {
      debug("drain");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await this.writeOperation;
      await (0, load_bindings_1.asyncDrain)(this.fd);
    }
  }
  darwin.DarwinPortBinding = DarwinPortBinding;
  return darwin;
}
var linux = {};
var linuxList = {};
var dist$2 = {};
var dist$1 = {};
var hasRequiredDist$4;
function requireDist$4() {
  if (hasRequiredDist$4) return dist$1;
  hasRequiredDist$4 = 1;
  Object.defineProperty(dist$1, "__esModule", { value: true });
  dist$1.DelimiterParser = void 0;
  const stream_1 = require$$0$2;
  class DelimiterParser extends stream_1.Transform {
    constructor({ delimiter, includeDelimiter = false, ...options }) {
      super(options);
      __publicField(this, "includeDelimiter");
      __publicField(this, "delimiter");
      __publicField(this, "buffer");
      if (delimiter === void 0) {
        throw new TypeError('"delimiter" is not a bufferable object');
      }
      if (delimiter.length === 0) {
        throw new TypeError('"delimiter" has a 0 or undefined length');
      }
      this.includeDelimiter = includeDelimiter;
      this.delimiter = Buffer.from(delimiter);
      this.buffer = Buffer.alloc(0);
    }
    _transform(chunk, encoding, cb) {
      let data = Buffer.concat([this.buffer, chunk]);
      let position;
      while ((position = data.indexOf(this.delimiter)) !== -1) {
        this.push(data.slice(0, position + (this.includeDelimiter ? this.delimiter.length : 0)));
        data = data.slice(position + this.delimiter.length);
      }
      this.buffer = data;
      cb();
    }
    _flush(cb) {
      this.push(this.buffer);
      this.buffer = Buffer.alloc(0);
      cb();
    }
  }
  dist$1.DelimiterParser = DelimiterParser;
  return dist$1;
}
var hasRequiredDist$3;
function requireDist$3() {
  if (hasRequiredDist$3) return dist$2;
  hasRequiredDist$3 = 1;
  Object.defineProperty(dist$2, "__esModule", { value: true });
  dist$2.ReadlineParser = void 0;
  const parser_delimiter_1 = requireDist$4();
  class ReadlineParser extends parser_delimiter_1.DelimiterParser {
    constructor(options) {
      const opts = {
        delimiter: Buffer.from("\n", "utf8"),
        encoding: "utf8",
        ...options
      };
      if (typeof opts.delimiter === "string") {
        opts.delimiter = Buffer.from(opts.delimiter, opts.encoding);
      }
      super(opts);
    }
  }
  dist$2.ReadlineParser = ReadlineParser;
  return dist$2;
}
var hasRequiredLinuxList;
function requireLinuxList() {
  if (hasRequiredLinuxList) return linuxList;
  hasRequiredLinuxList = 1;
  Object.defineProperty(linuxList, "__esModule", { value: true });
  linuxList.linuxList = linuxList$1;
  const child_process_1 = require$$0$4;
  const parser_readline_1 = requireDist$3();
  function checkPathOfDevice(path2) {
    return /(tty(S|WCH|ACM|USB|AMA|MFD|O|XRUSB)|rfcomm)/.test(path2) && path2;
  }
  function propName(name2) {
    return {
      DEVNAME: "path",
      ID_VENDOR_ENC: "manufacturer",
      ID_SERIAL_SHORT: "serialNumber",
      ID_VENDOR_ID: "vendorId",
      ID_MODEL_ID: "productId",
      DEVLINKS: "pnpId",
      /**
      * Workaround for systemd defect
      * see https://github.com/serialport/bindings-cpp/issues/115
      */
      ID_USB_VENDOR_ENC: "manufacturer",
      ID_USB_SERIAL_SHORT: "serialNumber",
      ID_USB_VENDOR_ID: "vendorId",
      ID_USB_MODEL_ID: "productId"
      // End of workaround
    }[name2.toUpperCase()];
  }
  function decodeHexEscape(str) {
    return str.replace(/\\x([a-fA-F0-9]{2})/g, (a, b) => {
      return String.fromCharCode(parseInt(b, 16));
    });
  }
  function propVal(name2, val) {
    if (name2 === "pnpId") {
      const match = val.match(/\/by-id\/([^\s]+)/);
      return (match === null || match === void 0 ? void 0 : match[1]) || void 0;
    }
    if (name2 === "manufacturer") {
      return decodeHexEscape(val);
    }
    if (/^0x/.test(val)) {
      return val.substr(2);
    }
    return val;
  }
  function linuxList$1(spawnCmd = child_process_1.spawn) {
    const ports = [];
    const udevadm = spawnCmd("udevadm", ["info", "-e"]);
    const lines = udevadm.stdout.pipe(new parser_readline_1.ReadlineParser());
    let skipPort = false;
    let port = {
      path: "",
      manufacturer: void 0,
      serialNumber: void 0,
      pnpId: void 0,
      locationId: void 0,
      vendorId: void 0,
      productId: void 0
    };
    lines.on("data", (line) => {
      const lineType = line.slice(0, 1);
      const data = line.slice(3);
      if (lineType === "P") {
        port = {
          path: "",
          manufacturer: void 0,
          serialNumber: void 0,
          pnpId: void 0,
          locationId: void 0,
          vendorId: void 0,
          productId: void 0
        };
        skipPort = false;
        return;
      }
      if (skipPort) {
        return;
      }
      if (lineType === "N") {
        if (checkPathOfDevice(data)) {
          ports.push(port);
        } else {
          skipPort = true;
        }
        return;
      }
      if (lineType === "E") {
        const keyValue = data.match(/^(.+)=(.*)/);
        if (!keyValue) {
          return;
        }
        const key = propName(keyValue[1]);
        if (!key) {
          return;
        }
        port[key] = propVal(key, keyValue[2]);
      }
    });
    return new Promise((resolve, reject) => {
      udevadm.on("close", (code) => {
        if (code) {
          reject(new Error(`Error listing ports udevadm exited with error code: ${code}`));
        }
      });
      udevadm.on("error", reject);
      lines.on("error", reject);
      lines.on("finish", () => resolve(ports));
    });
  }
  return linuxList;
}
var hasRequiredLinux;
function requireLinux() {
  if (hasRequiredLinux) return linux;
  hasRequiredLinux = 1;
  var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(linux, "__esModule", { value: true });
  linux.LinuxPortBinding = linux.LinuxBinding = void 0;
  const debug_1 = __importDefault(requireSrc$1());
  const linux_list_1 = requireLinuxList();
  const poller_1 = requirePoller();
  const unix_read_1 = requireUnixRead();
  const unix_write_1 = requireUnixWrite();
  const load_bindings_1 = requireLoadBindings();
  const debug = (0, debug_1.default)("serialport/bindings-cpp");
  linux.LinuxBinding = {
    list() {
      debug("list");
      return (0, linux_list_1.linuxList)();
    },
    async open(options) {
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new TypeError('"options" is not an object');
      }
      if (!options.path) {
        throw new TypeError('"path" is not a valid port');
      }
      if (!options.baudRate) {
        throw new TypeError('"baudRate" is not a valid baudRate');
      }
      debug("open");
      const openOptions = Object.assign({ vmin: 1, vtime: 0, dataBits: 8, lock: true, stopBits: 1, parity: "none", rtscts: false, xon: false, xoff: false, xany: false, hupcl: true }, options);
      const fd = await (0, load_bindings_1.asyncOpen)(openOptions.path, openOptions);
      this.fd = fd;
      return new LinuxPortBinding(fd, openOptions);
    }
  };
  class LinuxPortBinding {
    constructor(fd, openOptions) {
      this.fd = fd;
      this.openOptions = openOptions;
      this.poller = new poller_1.Poller(fd);
      this.writeOperation = null;
    }
    get isOpen() {
      return this.fd !== null;
    }
    async close() {
      debug("close");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      const fd = this.fd;
      this.poller.stop();
      this.poller.destroy();
      this.fd = null;
      await (0, load_bindings_1.asyncClose)(fd);
    }
    async read(buffer, offset, length) {
      if (!Buffer.isBuffer(buffer)) {
        throw new TypeError('"buffer" is not a Buffer');
      }
      if (typeof offset !== "number" || isNaN(offset)) {
        throw new TypeError(`"offset" is not an integer got "${isNaN(offset) ? "NaN" : typeof offset}"`);
      }
      if (typeof length !== "number" || isNaN(length)) {
        throw new TypeError(`"length" is not an integer got "${isNaN(length) ? "NaN" : typeof length}"`);
      }
      debug("read");
      if (buffer.length < offset + length) {
        throw new Error("buffer is too small");
      }
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      return (0, unix_read_1.unixRead)({ binding: this, buffer, offset, length });
    }
    async write(buffer) {
      if (!Buffer.isBuffer(buffer)) {
        throw new TypeError('"buffer" is not a Buffer');
      }
      debug("write", buffer.length, "bytes");
      if (!this.isOpen) {
        debug("write", "error port is not open");
        throw new Error("Port is not open");
      }
      this.writeOperation = (async () => {
        if (buffer.length === 0) {
          return;
        }
        await (0, unix_write_1.unixWrite)({ binding: this, buffer });
        this.writeOperation = null;
      })();
      return this.writeOperation;
    }
    async update(options) {
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw TypeError('"options" is not an object');
      }
      if (typeof options.baudRate !== "number") {
        throw new TypeError('"options.baudRate" is not a number');
      }
      debug("update");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await (0, load_bindings_1.asyncUpdate)(this.fd, options);
    }
    async set(options) {
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new TypeError('"options" is not an object');
      }
      debug("set");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await (0, load_bindings_1.asyncSet)(this.fd, options);
    }
    async get() {
      debug("get");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      return (0, load_bindings_1.asyncGet)(this.fd);
    }
    async getBaudRate() {
      debug("getBaudRate");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      return (0, load_bindings_1.asyncGetBaudRate)(this.fd);
    }
    async flush() {
      debug("flush");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await (0, load_bindings_1.asyncFlush)(this.fd);
    }
    async drain() {
      debug("drain");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await this.writeOperation;
      await (0, load_bindings_1.asyncDrain)(this.fd);
    }
  }
  linux.LinuxPortBinding = LinuxPortBinding;
  return linux;
}
var win32 = {};
var win32SnParser = {};
var hasRequiredWin32SnParser;
function requireWin32SnParser() {
  if (hasRequiredWin32SnParser) return win32SnParser;
  hasRequiredWin32SnParser = 1;
  Object.defineProperty(win32SnParser, "__esModule", { value: true });
  win32SnParser.serialNumParser = void 0;
  const PARSERS = [/USB\\(?:.+)\\(.+)/, /FTDIBUS\\(?:.+)\+(.+?)A?\\.+/];
  const serialNumParser = (pnpId) => {
    if (!pnpId) {
      return null;
    }
    for (const parser of PARSERS) {
      const sn = pnpId.match(parser);
      if (sn) {
        return sn[1];
      }
    }
    return null;
  };
  win32SnParser.serialNumParser = serialNumParser;
  return win32SnParser;
}
var hasRequiredWin32;
function requireWin32() {
  if (hasRequiredWin32) return win32;
  hasRequiredWin32 = 1;
  var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(win32, "__esModule", { value: true });
  win32.WindowsPortBinding = win32.WindowsBinding = void 0;
  const debug_1 = __importDefault(requireSrc$1());
  const _1 = requireDist$1();
  const load_bindings_1 = requireLoadBindings();
  const win32_sn_parser_1 = requireWin32SnParser();
  const debug = (0, debug_1.default)("serialport/bindings-cpp");
  win32.WindowsBinding = {
    async list() {
      const ports = await (0, load_bindings_1.asyncList)();
      return ports.map((port) => {
        if (port.pnpId && !port.serialNumber) {
          const serialNumber = (0, win32_sn_parser_1.serialNumParser)(port.pnpId);
          if (serialNumber) {
            return Object.assign(Object.assign({}, port), { serialNumber });
          }
        }
        return port;
      });
    },
    async open(options) {
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new TypeError('"options" is not an object');
      }
      if (!options.path) {
        throw new TypeError('"path" is not a valid port');
      }
      if (!options.baudRate) {
        throw new TypeError('"baudRate" is not a valid baudRate');
      }
      debug("open");
      const openOptions = Object.assign({ dataBits: 8, lock: true, stopBits: 1, parity: "none", rtscts: false, rtsMode: "handshake", xon: false, xoff: false, xany: false, hupcl: true }, options);
      const fd = await (0, load_bindings_1.asyncOpen)(openOptions.path, openOptions);
      return new WindowsPortBinding(fd, openOptions);
    }
  };
  class WindowsPortBinding {
    constructor(fd, options) {
      this.fd = fd;
      this.openOptions = options;
      this.writeOperation = null;
    }
    get isOpen() {
      return this.fd !== null;
    }
    async close() {
      debug("close");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      const fd = this.fd;
      this.fd = null;
      await (0, load_bindings_1.asyncClose)(fd);
    }
    async read(buffer, offset, length) {
      if (!Buffer.isBuffer(buffer)) {
        throw new TypeError('"buffer" is not a Buffer');
      }
      if (typeof offset !== "number" || isNaN(offset)) {
        throw new TypeError(`"offset" is not an integer got "${isNaN(offset) ? "NaN" : typeof offset}"`);
      }
      if (typeof length !== "number" || isNaN(length)) {
        throw new TypeError(`"length" is not an integer got "${isNaN(length) ? "NaN" : typeof length}"`);
      }
      debug("read");
      if (buffer.length < offset + length) {
        throw new Error("buffer is too small");
      }
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      try {
        const bytesRead = await (0, load_bindings_1.asyncRead)(this.fd, buffer, offset, length);
        return { bytesRead, buffer };
      } catch (err) {
        if (!this.isOpen) {
          throw new _1.BindingsError(err.message, { canceled: true });
        }
        throw err;
      }
    }
    async write(buffer) {
      if (!Buffer.isBuffer(buffer)) {
        throw new TypeError('"buffer" is not a Buffer');
      }
      debug("write", buffer.length, "bytes");
      if (!this.isOpen) {
        debug("write", "error port is not open");
        throw new Error("Port is not open");
      }
      this.writeOperation = (async () => {
        if (buffer.length === 0) {
          return;
        }
        await (0, load_bindings_1.asyncWrite)(this.fd, buffer);
        this.writeOperation = null;
      })();
      return this.writeOperation;
    }
    async update(options) {
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw TypeError('"options" is not an object');
      }
      if (typeof options.baudRate !== "number") {
        throw new TypeError('"options.baudRate" is not a number');
      }
      debug("update");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await (0, load_bindings_1.asyncUpdate)(this.fd, options);
    }
    async set(options) {
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new TypeError('"options" is not an object');
      }
      debug("set", options);
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await (0, load_bindings_1.asyncSet)(this.fd, options);
    }
    async get() {
      debug("get");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      return (0, load_bindings_1.asyncGet)(this.fd);
    }
    async getBaudRate() {
      debug("getBaudRate");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      return (0, load_bindings_1.asyncGetBaudRate)(this.fd);
    }
    async flush() {
      debug("flush");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await (0, load_bindings_1.asyncFlush)(this.fd);
    }
    async drain() {
      debug("drain");
      if (!this.isOpen) {
        throw new Error("Port is not open");
      }
      await this.writeOperation;
      await (0, load_bindings_1.asyncDrain)(this.fd);
    }
  }
  win32.WindowsPortBinding = WindowsPortBinding;
  return win32;
}
var dist = {};
var hasRequiredDist$2;
function requireDist$2() {
  if (hasRequiredDist$2) return dist;
  hasRequiredDist$2 = 1;
  return dist;
}
var hasRequiredDist$1;
function requireDist$1() {
  if (hasRequiredDist$1) return dist$3;
  hasRequiredDist$1 = 1;
  (function(exports) {
    var __createBinding = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.autoDetect = autoDetect;
    const debug_1 = __importDefault(requireSrc$1());
    const darwin_1 = requireDarwin();
    const linux_1 = requireLinux();
    const win32_1 = requireWin32();
    const debug = (0, debug_1.default)("serialport/bindings-cpp");
    __exportStar(requireDist$2(), exports);
    __exportStar(requireDarwin(), exports);
    __exportStar(requireLinux(), exports);
    __exportStar(requireWin32(), exports);
    __exportStar(requireErrors(), exports);
    function autoDetect() {
      switch (process.platform) {
        case "win32":
          debug("loading WindowsBinding");
          return win32_1.WindowsBinding;
        case "darwin":
          debug("loading DarwinBinding");
          return darwin_1.DarwinBinding;
        default:
          debug("loading LinuxBinding");
          return linux_1.LinuxBinding;
      }
    }
  })(dist$3);
  return dist$3;
}
var hasRequiredSerialport;
function requireSerialport() {
  if (hasRequiredSerialport) return serialport;
  hasRequiredSerialport = 1;
  Object.defineProperty(serialport, "__esModule", { value: true });
  serialport.SerialPort = void 0;
  const stream_1 = requireDist$6();
  const bindings_cpp_1 = requireDist$1();
  const DetectedBinding = (0, bindings_cpp_1.autoDetect)();
  class SerialPort extends stream_1.SerialPortStream {
    constructor(options, openCallback) {
      const opts = {
        binding: DetectedBinding,
        ...options
      };
      super(opts, openCallback);
    }
  }
  __publicField(SerialPort, "list", DetectedBinding.list);
  __publicField(SerialPort, "binding", DetectedBinding);
  serialport.SerialPort = SerialPort;
  return serialport;
}
var hasRequiredDist;
function requireDist() {
  if (hasRequiredDist) return dist$g;
  hasRequiredDist = 1;
  (function(exports) {
    var __createBinding = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(requireDist$g(), exports);
    __exportStar(requireDist$f(), exports);
    __exportStar(requireDist$e(), exports);
    __exportStar(requireDist$d(), exports);
    __exportStar(requireDist$c(), exports);
    __exportStar(requireDist$b(), exports);
    __exportStar(requireDist$a(), exports);
    __exportStar(requireDist$9(), exports);
    __exportStar(requireDist$8(), exports);
    __exportStar(requireDist$7(), exports);
    __exportStar(requireSerialportMock(), exports);
    __exportStar(requireSerialport(), exports);
  })(dist$g);
  return dist$g;
}
var tcpport;
var hasRequiredTcpport;
function requireTcpport() {
  if (hasRequiredTcpport) return tcpport;
  hasRequiredTcpport = 1;
  const events = require$$0$3;
  const EventEmitter = events.EventEmitter || events;
  const net2 = require$$1$1;
  const modbusSerialDebug = srcExports("modbus-serial");
  const crc16$1 = crc16;
  const MODBUS_PORT = 502;
  const MAX_TRANSACTIONS = 256;
  const MIN_DATA_LENGTH = 4;
  const MIN_MBAP_LENGTH = 6;
  const CRC_LENGTH = 2;
  class TcpPort extends EventEmitter {
    /**
     * Simulate a modbus-RTU port using modbus-TCP connection.
     *
     * @param {string} ip - IP address of Modbus slave.
     * @param {Object} options - Options object (extends {@link net#connect} options).
     *   options.port: Nonstandard Modbus port (default is 502).
     *   options.localAddress: Local IP address to bind to, default is any.
     *   options.family: 4 = IPv4-only, 6 = IPv6-only, 0 = either (default).
     *   options.timeout, options.socket, options.socketOpts: see implementation.
     * @constructor
     */
    constructor(ip, options) {
      super();
      const self2 = this;
      this.openFlag = false;
      this.callback = null;
      this._transactionIdWrite = 1;
      this._externalSocket = null;
      if (typeof ip === "object") {
        options = ip;
        ip = void 0;
      }
      if (typeof options === "undefined") options = {};
      this.socketOpts = void 0;
      if (options.socketOpts) {
        this.socketOpts = options.socketOpts;
        delete options.socketOpts;
      }
      this.connectOptions = {
        // Default options
        ...{
          host: ip || options.ip,
          port: MODBUS_PORT
        },
        // User options
        ...options
      };
      if (options.socket) {
        if (options.socket instanceof net2.Socket) {
          this._externalSocket = options.socket;
          this.openFlag = this._externalSocket.readyState === "opening" || this._externalSocket.readyState === "open";
        } else {
          throw new Error("invalid socket provided");
        }
      }
      const handleCallback = function(had_error) {
        if (self2.callback) {
          self2.callback(had_error);
          self2.callback = null;
        }
      };
      this._client = this._externalSocket || new net2.Socket(this.socketOpts);
      this._writeCompleted = Promise.resolve();
      if (options.timeout) this._client.setTimeout(options.timeout);
      self2._clientRcvData = Buffer.alloc(0);
      this._client.on("data", function(data) {
        let buffer;
        let crc;
        let length;
        self2._clientRcvData = Buffer.concat([self2._clientRcvData, data]);
        modbusSerialDebug({ action: "receive tcp port strings", data, clientRcvData: self2._clientRcvData });
        while (self2._clientRcvData.length > MIN_MBAP_LENGTH) {
          length = self2._clientRcvData.readUInt16BE(4);
          if (self2._clientRcvData.length < length + MIN_MBAP_LENGTH) {
            return;
          }
          buffer = Buffer.alloc(length + CRC_LENGTH);
          self2._clientRcvData.copy(buffer, 0, MIN_MBAP_LENGTH);
          crc = crc16$1(buffer.slice(0, -CRC_LENGTH));
          buffer.writeUInt16LE(crc, buffer.length - CRC_LENGTH);
          self2._transactionIdRead = self2._clientRcvData.readUInt16BE(0);
          self2.emit("data", buffer);
          modbusSerialDebug({ action: "parsed tcp port", buffer, transactionId: self2._transactionIdRead });
          self2._clientRcvData = self2._clientRcvData.slice(length + MIN_MBAP_LENGTH);
        }
      });
      this._client.on("connect", function() {
        self2.openFlag = true;
        self2._writeCompleted = Promise.resolve();
        modbusSerialDebug("TCP port: signal connect");
        self2._client.setNoDelay();
        handleCallback();
      });
      this._client.on("close", function(had_error) {
        if (self2.openFlag) {
          self2.openFlag = false;
          self2._clientRcvData = Buffer.alloc(0);
          modbusSerialDebug("TCP port: signal close: " + had_error);
          handleCallback(had_error);
          self2.emit("close");
          self2.removeAllListeners();
        }
      });
      this._client.on("error", function(had_error) {
        self2.openFlag = false;
        modbusSerialDebug("TCP port: signal error: " + had_error);
        handleCallback(had_error);
      });
      this._client.on("timeout", function() {
        modbusSerialDebug("TCP port: TimedOut");
        handleCallback(new Error("TCP Connection Timed Out"));
      });
    }
    /**
     * Check if port is open.
     *
     * @returns {boolean}
     */
    get isOpen() {
      return this.openFlag;
    }
    /**
     * Simulate successful port open.
     *
     * @param {function(Error=):void} callback
     */
    open(callback) {
      if (this._externalSocket === null) {
        this.callback = callback;
        this._client.connect(this.connectOptions);
      } else if (this.openFlag) {
        modbusSerialDebug("TCP port: external socket is opened");
        callback();
      } else {
        callback(new Error("TCP port: external socket is not opened"));
      }
    }
    /**
     * Simulate successful close port.
     *
     * @param {function(Error=):void} callback
     */
    close(callback) {
      this.callback = callback;
      this._client.end();
    }
    /**
     * Simulate successful destroy port.
     *
     * @param {function(Error=):void} callback
     */
    destroy(callback) {
      this.callback = callback;
      if (!this._client.destroyed) {
        this._client.destroy();
      }
    }
    /**
     * Send data to a modbus-tcp slave.
     *
     * @param {Buffer} data
     */
    write(data) {
      if (data.length < MIN_DATA_LENGTH) {
        modbusSerialDebug("expected length of data is to small - minimum is " + MIN_DATA_LENGTH);
        return;
      }
      this._id = data[0];
      this._cmd = data[1];
      const buffer = Buffer.alloc(data.length + MIN_MBAP_LENGTH - CRC_LENGTH);
      buffer.writeUInt16BE(this._transactionIdWrite, 0);
      buffer.writeUInt16BE(0, 2);
      buffer.writeUInt16BE(data.length - CRC_LENGTH, 4);
      data.copy(buffer, MIN_MBAP_LENGTH);
      modbusSerialDebug({
        action: "send tcp port",
        data,
        buffer,
        unitid: this._id,
        functionCode: this._cmd,
        transactionsId: this._transactionIdWrite
      });
      const previousWritePromise = this._writeCompleted;
      const newWritePromise = new Promise((resolveNewWrite, rejectNewWrite) => {
        previousWritePromise.finally(() => {
          try {
            if (this._client.write(buffer)) {
              resolveNewWrite();
            } else {
              this._client.once("drain", resolveNewWrite);
            }
          } catch (error) {
            rejectNewWrite(error);
          }
        });
      });
      this._writeCompleted = newWritePromise;
      this._transactionIdWrite = (this._transactionIdWrite + 1) % MAX_TRANSACTIONS;
    }
  }
  tcpport = TcpPort;
  return tcpport;
}
var tcprtubufferedport;
var hasRequiredTcprtubufferedport;
function requireTcprtubufferedport() {
  if (hasRequiredTcprtubufferedport) return tcprtubufferedport;
  hasRequiredTcprtubufferedport = 1;
  const events = require$$0$3;
  const EventEmitter = events.EventEmitter || events;
  const net2 = require$$1$1;
  const modbusSerialDebug = srcExports("modbus-serial");
  const crc16$1 = crc16;
  const EXCEPTION_LENGTH = 3;
  const MIN_DATA_LENGTH = 6;
  const MIN_MBAP_LENGTH = 6;
  const MAX_TRANSACTIONS = 64;
  const MAX_BUFFER_LENGTH = 256;
  const CRC_LENGTH = 2;
  const MODBUS_PORT = 502;
  class TcpRTUBufferedPort extends EventEmitter {
    /**
     * Simulate a modbus-RTU port using TCP connection
     * @module TcpRTUBufferedPort
     *
     * @param {string} ip - ip address
     * @param {object} options - all options as JSON object
     *   options.port: Nonstandard Modbus port (default is 502).
     *   options.localAddress: Local IP address to bind to, default is any.
     *   options.family: 4 = IPv4-only, 6 = IPv6-only, 0 = either (default).
     * @constructor
     */
    constructor(ip, options) {
      super();
      const modbus = this;
      modbus.openFlag = false;
      modbus.callback = null;
      modbus._transactionIdWrite = 1;
      this._externalSocket = null;
      if (typeof ip === "object") {
        options = ip;
      }
      if (typeof options === "undefined") options = {};
      modbus.connectOptions = {
        host: ip || options.ip,
        port: options.port || MODBUS_PORT,
        localAddress: options.localAddress,
        family: options.family || 0
      };
      if (options.socket) {
        if (options.socket instanceof net2.Socket) {
          this._externalSocket = options.socket;
          this.openFlag = this._externalSocket.readyState === "opening" || this._externalSocket.readyState === "open";
        } else {
          throw new Error("invalid socket provided");
        }
      }
      modbus._buffer = Buffer.alloc(0);
      const handleCallback = function(had_error) {
        if (modbus.callback) {
          modbus.callback(had_error);
          modbus.callback = null;
        }
      };
      modbus._client = this._externalSocket || new net2.Socket();
      if (options.timeout) this._client.setTimeout(options.timeout);
      modbus._client.on("data", function onData(data) {
        modbus._buffer = Buffer.concat([modbus._buffer, data]);
        modbusSerialDebug({
          action: "receive tcp rtu buffered port",
          data,
          buffer: modbus._buffer
        });
        let bufferLength = modbus._buffer.length;
        if (bufferLength < MIN_MBAP_LENGTH) return;
        if (bufferLength > MAX_BUFFER_LENGTH) {
          modbus._buffer = modbus._buffer.slice(-MAX_BUFFER_LENGTH);
          bufferLength = MAX_BUFFER_LENGTH;
        }
        if (bufferLength < MIN_MBAP_LENGTH + EXCEPTION_LENGTH) return;
        const maxOffset = bufferLength - MIN_MBAP_LENGTH;
        for (let i = 0; i <= maxOffset; i++) {
          modbus._transactionIdRead = modbus._buffer.readUInt16BE(i);
          const protocolID = modbus._buffer.readUInt16BE(i + 2);
          const msgLength = modbus._buffer.readUInt16BE(i + 4);
          const cmd = modbus._buffer[i + 7];
          modbusSerialDebug({
            protocolID,
            msgLength,
            bufferLength,
            cmd
          });
          if (protocolID === 0 && cmd !== 0 && msgLength >= EXCEPTION_LENGTH && i + MIN_MBAP_LENGTH + msgLength <= bufferLength) {
            modbus._emitData(i + MIN_MBAP_LENGTH, msgLength);
            return;
          }
        }
      });
      this._client.on("connect", function() {
        modbus.openFlag = true;
        handleCallback();
      });
      this._client.on("close", function(had_error) {
        if (modbus.openFlag) {
          modbus.openFlag = false;
          modbusSerialDebug("TCP buffered port: signal close: " + had_error);
          handleCallback(had_error);
          modbus.emit("close");
          modbus.removeAllListeners();
        }
      });
      this._client.on("error", function(had_error) {
        modbus.openFlag = false;
        handleCallback(had_error);
      });
      this._client.on("timeout", function() {
        modbusSerialDebug("TcpRTUBufferedPort port: TimedOut");
        handleCallback(new Error("TcpRTUBufferedPort Connection Timed Out"));
      });
    }
    /**
     * Check if port is open.
     *
     * @returns {boolean}
     */
    get isOpen() {
      return this.openFlag;
    }
    /**
     * Emit the received response, cut the buffer and reset the internal vars.
     *
     * @param {number} start the start index of the response within the buffer
     * @param {number} length the length of the response
     * @private
     */
    _emitData(start, length) {
      const modbus = this;
      const data = modbus._buffer.slice(start, start + length);
      modbus._buffer = modbus._buffer.slice(start + length);
      if (data.length > 0) {
        const buffer = Buffer.alloc(data.length + CRC_LENGTH);
        data.copy(buffer, 0);
        const crc = crc16$1(buffer.slice(0, -CRC_LENGTH));
        buffer.writeUInt16LE(crc, buffer.length - CRC_LENGTH);
        modbus.emit("data", buffer);
        modbusSerialDebug({
          action: "parsed tcp buffered port",
          buffer,
          transactionId: modbus._transactionIdRead
        });
      } else {
        modbusSerialDebug({ action: "emit data to short", data });
      }
    }
    /**
     * Simulate successful port open.
     *
     * @param callback
     */
    open(callback) {
      if (this._externalSocket === null) {
        this.callback = callback;
        this._client.connect(this.connectOptions);
      } else if (this.openFlag) {
        modbusSerialDebug("TcpRTUBuffered port: external socket is opened");
        callback();
      } else {
        callback(new Error("TcpRTUBuffered port: external socket is not opened"));
      }
    }
    /**
     * Simulate successful close port.
     *
     * @param callback
     */
    close(callback) {
      this.callback = callback;
      this._client.end();
    }
    /**
     * Simulate successful destroy port.
     *
     * @param callback
     */
    destroy(callback) {
      this.callback = callback;
      if (!this._client.destroyed) {
        this._client.destroy();
      }
    }
    /**
     * Send data to a modbus slave via telnet server.
     *
     * @param {Buffer} data
     */
    write(data) {
      if (data.length < MIN_DATA_LENGTH) {
        modbusSerialDebug(
          "expected length of data is to small - minimum is " + MIN_DATA_LENGTH
        );
        return;
      }
      const buffer = Buffer.alloc(data.length + MIN_MBAP_LENGTH - CRC_LENGTH);
      buffer.writeUInt16BE(this._transactionIdWrite, 0);
      buffer.writeUInt16BE(0, 2);
      buffer.writeUInt16BE(data.length - CRC_LENGTH, 4);
      data.copy(buffer, MIN_MBAP_LENGTH);
      modbusSerialDebug({
        action: "send tcp rtu buffered port",
        data,
        buffer,
        transactionsId: this._transactionIdWrite
      });
      this._transactionIdWrite = (this._transactionIdWrite + 1) % MAX_TRANSACTIONS;
      this._client.write(buffer);
    }
  }
  tcprtubufferedport = TcpRTUBufferedPort;
  return tcprtubufferedport;
}
var telnetport;
var hasRequiredTelnetport;
function requireTelnetport() {
  if (hasRequiredTelnetport) return telnetport;
  hasRequiredTelnetport = 1;
  const events = require$$0$3;
  const EventEmitter = events.EventEmitter || events;
  const net2 = require$$1$1;
  const modbusSerialDebug = srcExports("modbus-serial");
  const EXCEPTION_LENGTH = 5;
  const MIN_DATA_LENGTH = 6;
  const TELNET_PORT = 2217;
  class TelnetPort extends EventEmitter {
    /**
     * Simulate a modbus-RTU port using Telnet connection.
     *
     * @param ip
     * @param options
     * @constructor
     */
    constructor(ip, options) {
      super();
      const self2 = this;
      this.ip = ip;
      this.openFlag = false;
      this.callback = null;
      this._externalSocket = null;
      if (typeof ip === "object") {
        options = ip;
        this.ip = options.ip;
      }
      if (typeof options === "undefined") options = {};
      this.port = options.port || TELNET_PORT;
      this._buffer = Buffer.alloc(0);
      this._id = 0;
      this._cmd = 0;
      this._length = 0;
      const handleCallback = function(had_error) {
        if (self2.callback) {
          self2.callback(had_error);
          self2.callback = null;
        }
      };
      if (options.socket) {
        if (options.socket instanceof net2.Socket) {
          this._externalSocket = options.socket;
          this.openFlag = this._externalSocket.readyState === "opening" || this._externalSocket.readyState === "open";
        } else {
          throw new Error("invalid socket provided");
        }
      }
      this._client = this._externalSocket || new net2.Socket();
      if (options.timeout) this._client.setTimeout(options.timeout);
      this._client.on("data", function onData(data) {
        self2._buffer = Buffer.concat([self2._buffer, data]);
        const expectedLength = self2._length;
        const bufferLength = self2._buffer.length;
        modbusSerialDebug(
          "on data expected length:" + expectedLength + " buffer length:" + bufferLength
        );
        modbusSerialDebug({
          action: "receive tcp telnet port",
          data,
          buffer: self2._buffer
        });
        modbusSerialDebug(
          JSON.stringify({
            action: "receive tcp telnet port strings",
            data,
            buffer: self2._buffer
          })
        );
        if (expectedLength < 6 || bufferLength < EXCEPTION_LENGTH) return;
        const maxOffset = bufferLength - EXCEPTION_LENGTH;
        for (let i = 0; i <= maxOffset; i++) {
          const unitId = self2._buffer[i];
          const functionCode = self2._buffer[i + 1];
          if (unitId !== self2._id) continue;
          if (functionCode === self2._cmd && i + expectedLength <= bufferLength) {
            self2._emitData(i, expectedLength);
            return;
          }
          if (functionCode === (128 | self2._cmd) && i + EXCEPTION_LENGTH <= bufferLength) {
            self2._emitData(i, EXCEPTION_LENGTH);
            return;
          }
          if (functionCode === (127 & self2._cmd)) break;
        }
      });
      this._client.on("connect", function() {
        self2.openFlag = true;
        handleCallback();
      });
      this._client.on("close", function(had_error) {
        self2.openFlag = false;
        handleCallback(had_error);
        self2.emit("close");
      });
      this._client.on("error", function(had_error) {
        self2.openFlag = false;
        handleCallback(had_error);
      });
      this._client.on("timeout", function() {
        modbusSerialDebug("TelnetPort port: TimedOut");
        handleCallback(new Error("TelnetPort Connection Timed Out."));
      });
    }
    /**
     * Check if port is open.
     *
     * @returns {boolean}
     */
    get isOpen() {
      return this.openFlag;
    }
    /**
     * Emit the received response, cut the buffer and reset the internal vars.
     *
     * @param {number} start the start index of the response within the buffer
     * @param {number} length the length of the response
     * @private
     */
    _emitData(start, length) {
      this.emit("data", this._buffer.slice(start, start + length));
      this._buffer = this._buffer.slice(start + length);
      this._id = 0;
      this._cmd = 0;
      this._length = 0;
    }
    /**
     * Simulate successful port open.
     *
     * @param callback
     */
    open(callback) {
      if (this._externalSocket === null) {
        this.callback = callback;
        this._client.connect(this.port, this.ip);
      } else if (this.openFlag) {
        modbusSerialDebug("telnet port: external socket is opened");
        callback();
      } else {
        callback(new Error("telnet port: external socket is not opened"));
      }
    }
    /**
     * Simulate successful close port.
     *
     * @param callback
     */
    close(callback) {
      this.callback = callback;
      this._client.end();
      this.removeAllListeners();
    }
    /**
     * Simulate successful destroy port.
     *
     * @param callback
     */
    destroy(callback) {
      this.callback = callback;
      if (!this._client.destroyed) {
        this._client.destroy();
      }
    }
    /**
     * Send data to a modbus slave via telnet server.
     *
     * @param {Buffer} data
     */
    write(data) {
      if (data.length < MIN_DATA_LENGTH) {
        modbusSerialDebug(
          "expected length of data is to small - minimum is " + MIN_DATA_LENGTH
        );
        return;
      }
      let length;
      this._id = data[0];
      this._cmd = data[1];
      switch (this._cmd) {
        case 1:
        case 2:
          length = data.readUInt16BE(4);
          this._length = 3 + parseInt((length - 1) / 8 + 1) + 2;
          break;
        case 3:
        case 4:
          length = data.readUInt16BE(4);
          this._length = 3 + 2 * length + 2;
          break;
        case 5:
        case 6:
        case 15:
        case 16:
          this._length = 6 + 2;
          break;
        default:
          this._length = 0;
          break;
      }
      this._client.write(data);
      modbusSerialDebug({
        action: "send tcp telnet port",
        data,
        unitid: this._id,
        functionCode: this._cmd
      });
      modbusSerialDebug(
        JSON.stringify({
          action: "send tcp telnet port strings",
          data,
          unitid: this._id,
          functionCode: this._cmd
        })
      );
    }
  }
  telnetport = TelnetPort;
  return telnetport;
}
var c701port;
var hasRequiredC701port;
function requireC701port() {
  if (hasRequiredC701port) return c701port;
  hasRequiredC701port = 1;
  const events = require$$0$3;
  const EventEmitter = events.EventEmitter || events;
  const dgram = require$$1$4;
  const modbusSerialDebug = srcExports("modbus-serial");
  const crc16$1 = crc16;
  const MIN_DATA_LENGTH = 6;
  const C701_PORT = 28674;
  function _checkData(modbus, buf) {
    if (buf.length !== modbus._length && buf.length !== 5) return false;
    const crcIn = buf.readUInt16LE(buf.length - 2);
    return buf[0] === modbus._id && (127 & buf[1]) === modbus._cmd && crcIn === crc16$1(buf.slice(0, -2));
  }
  class UdpPort extends EventEmitter {
    /**
     * Simulate a modbus-RTU port using C701 UDP-to-Serial bridge.
     *
     * @param ip
     * @param options
     * @constructor
     */
    constructor(ip, options) {
      super();
      const modbus = this;
      this.ip = ip;
      this.openFlag = false;
      if (typeof options === "undefined") options = {};
      this.port = options.port || C701_PORT;
      this._client = dgram.createSocket("udp4");
      this._client.on("message", function(data) {
        let buffer;
        if (modbus.length < 6) return;
        if (data.length < 116 + 5) return;
        if (data.readUInt16LE(2) !== 602) return;
        buffer = data.slice(data.length - modbus._length);
        modbusSerialDebug({ action: "receive c701 upd port", data, buffer });
        modbusSerialDebug(JSON.stringify({ action: "receive c701 upd port strings", data, buffer }));
        if (_checkData(modbus, buffer)) {
          modbusSerialDebug({ action: "emit data serial rtu buffered port", buffer });
          modbusSerialDebug(JSON.stringify({ action: "emit data serial rtu buffered port strings", buffer }));
          modbus.emit("data", buffer);
        } else {
          buffer = data.slice(data.length - 5);
          if (_checkData(modbus, buffer)) {
            modbusSerialDebug({ action: "emit data serial rtu buffered port", buffer });
            modbusSerialDebug(JSON.stringify({
              action: "emit data serial rtu buffered port strings",
              buffer
            }));
            modbus.emit("data", buffer);
          }
        }
      });
      this._client.on("listening", function() {
        modbus.openFlag = true;
      });
      this._client.on("close", function() {
        modbus.openFlag = false;
      });
    }
    /**
     * Check if port is open.
     *
     * @returns {boolean}
     */
    get isOpen() {
      return this.openFlag;
    }
    /**
     * Simulate successful port open.
     *
     * @param callback
     */
    open(callback) {
      if (callback)
        callback(null);
    }
    /**
     * Simulate successful close port.
     *
     * @param callback
     */
    close(callback) {
      this._client.close();
      if (callback)
        callback(null);
    }
    /**
     * Send data to a modbus-tcp slave.
     *
     * @param data
     */
    write(data) {
      if (data.length < MIN_DATA_LENGTH) {
        modbusSerialDebug("expected length of data is to small - minimum is " + MIN_DATA_LENGTH);
        return;
      }
      let length;
      this._id = data[0];
      this._cmd = data[1];
      switch (this._cmd) {
        case 1:
        case 2:
          length = data.readUInt16BE(4);
          this._length = 3 + parseInt((length - 1) / 8 + 1) + 2;
          break;
        case 3:
        case 4:
          length = data.readUInt16BE(4);
          this._length = 3 + 2 * length + 2;
          break;
        case 5:
        case 6:
        case 15:
        case 16:
          this._length = 6 + 2;
          break;
        default:
          this._length = 0;
          break;
      }
      const buffer = Buffer.alloc(data.length + 116);
      buffer.fill(0);
      buffer.writeUInt16LE(600, 2);
      buffer.writeUInt16LE(0, 36);
      buffer.writeUInt16LE(this._length, 38);
      buffer.writeUInt16LE(1, 102);
      buffer.writeUInt16LE(data.length, 104);
      data.copy(buffer, 116);
      this._client.send(buffer, 0, buffer.length, this.port, this.ip);
      modbusSerialDebug({
        action: "send c701 upd port",
        data,
        buffer,
        unitid: this._id,
        functionCode: this._cmd
      });
      modbusSerialDebug(JSON.stringify({
        action: "send c701 upd port strings",
        data,
        buffer,
        unitid: this._id,
        functionCode: this._cmd
      }));
    }
  }
  c701port = UdpPort;
  return c701port;
}
var udpport;
var hasRequiredUdpport;
function requireUdpport() {
  if (hasRequiredUdpport) return udpport;
  hasRequiredUdpport = 1;
  const events = require$$0$3;
  const EventEmitter = events.EventEmitter || events;
  const dgram = require$$1$4;
  const modbusSerialDebug = srcExports("modbus-serial");
  const crc16$1 = crc16;
  const MODBUS_PORT = 502;
  const MAX_TRANSACTIONS = 256;
  const MIN_DATA_LENGTH = 6;
  const MIN_MBAP_LENGTH = 6;
  const CRC_LENGTH = 2;
  class ModbusUdpPort extends EventEmitter {
    /**
     * Simulate a modbus-RTU port using modbus-udp.
     *
     * @param ip
     * @param options
     * @constructor
     */
    constructor(ip, options) {
      super();
      const modbus = this;
      this.ip = ip;
      this.openFlag = false;
      this._transactionIdWrite = 1;
      if (typeof options === "undefined") {
        options = {};
      }
      this.port = options.port || MODBUS_PORT;
      this._client = dgram.createSocket("udp4");
      this._client.bind();
      const self2 = this;
      this._client.on("message", function(data, rinfo) {
        let buffer;
        let crc;
        let length;
        if (rinfo.address !== self2.ip || rinfo.port !== self2.port) {
          return;
        }
        modbusSerialDebug({ action: "receive udp port strings", data });
        while (data.length > MIN_MBAP_LENGTH) {
          length = data.readUInt16BE(4);
          buffer = Buffer.alloc(length + CRC_LENGTH);
          data.copy(buffer, 0, MIN_MBAP_LENGTH);
          crc = crc16$1(buffer.slice(0, -CRC_LENGTH));
          buffer.writeUInt16LE(crc, buffer.length - CRC_LENGTH);
          modbus._transactionIdRead = data.readUInt16BE(0);
          modbus.emit("data", buffer);
          modbusSerialDebug({ action: "parsed udp port", buffer, transactionId: modbus._transactionIdRead });
          data = data.slice(length + MIN_MBAP_LENGTH);
        }
      });
      this._client.on("listening", function() {
        modbus.openFlag = true;
      });
      this._client.on("close", function() {
        modbus.openFlag = false;
      });
    }
    /**
     * Check if port is open.
     *
     * @returns {boolean}
     */
    get isOpen() {
      return this.openFlag;
    }
    /**
     * Simulate successful port open.
     *
     * @param callback
     */
    open(callback) {
      if (callback)
        callback(null);
    }
    /**
     * Simulate successful close port.
     *
     * @param callback
     */
    close(callback) {
      this._client.close();
      if (callback)
        callback(null);
    }
    /**
     * Send data to a modbus-udp slave.
     *
     * @param data
     */
    write(data) {
      if (data.length < MIN_DATA_LENGTH) {
        modbusSerialDebug("expected length of data is too small - minimum is " + MIN_DATA_LENGTH);
        return;
      }
      this._id = data[0];
      this._cmd = data[1];
      const buffer = Buffer.alloc(data.length + MIN_MBAP_LENGTH - CRC_LENGTH);
      buffer.writeUInt16BE(this._transactionIdWrite, 0);
      buffer.writeUInt16BE(0, 2);
      buffer.writeUInt16BE(data.length - CRC_LENGTH, 4);
      data.copy(buffer, MIN_MBAP_LENGTH);
      modbusSerialDebug({
        action: "send modbus udp port",
        data,
        buffer,
        unitid: this._id,
        functionCode: this._cmd
      });
      this._client.send(buffer, 0, buffer.length, this.port, this.ip);
      this._transactionIdWrite = (this._transactionIdWrite + 1) % MAX_TRANSACTIONS;
    }
  }
  udpport = ModbusUdpPort;
  return udpport;
}
var rtubufferedport;
var hasRequiredRtubufferedport;
function requireRtubufferedport() {
  if (hasRequiredRtubufferedport) return rtubufferedport;
  hasRequiredRtubufferedport = 1;
  const events = require$$0$3;
  const EventEmitter = events.EventEmitter || events;
  const SerialPort = requireDist().SerialPort;
  const modbusSerialDebug = srcExports("modbus-serial");
  const EXCEPTION_LENGTH = 5;
  const MIN_DATA_LENGTH = 6;
  const MIN_WRITE_DATA_LENGTH = 4;
  const MAX_BUFFER_LENGTH = 256;
  const CRC_LENGTH = 2;
  const READ_DEVICE_IDENTIFICATION_FUNCTION_CODE = 43;
  const REPORT_SERVER_ID_FUNCTION_CODE = 17;
  const LENGTH_UNKNOWN = "unknown";
  const BITS_TO_NUM_OF_OBJECTS = 7;
  const calculateFC43Length = function(buffer, numObjects, i, bufferLength) {
    const result = { hasAllData: true };
    let currentByte = 8 + i;
    if (numObjects > 0) {
      for (let j = 0; j < numObjects; j++) {
        if (bufferLength < currentByte) {
          result.hasAllData = false;
          break;
        }
        const objLength = buffer[currentByte + 1];
        if (!objLength) {
          result.hasAllData = false;
          break;
        }
        currentByte += 2 + objLength;
      }
    }
    if (currentByte + CRC_LENGTH > bufferLength) {
      result.hasAllData = false;
    }
    if (result.hasAllData) {
      result.bufLength = currentByte + CRC_LENGTH;
    }
    return result;
  };
  class RTUBufferedPort extends EventEmitter {
    /**
     * Simulate a modbus-RTU port using buffered serial connection.
     *
     * @param path
     * @param options
     * @constructor
     */
    constructor(path2, options) {
      super();
      const self2 = this;
      if (typeof options === "undefined") options = {};
      options.autoOpen = false;
      this._buffer = Buffer.alloc(0);
      this._id = 0;
      this._cmd = 0;
      this._length = 0;
      this._client = new SerialPort(Object.assign({}, { path: path2 }, options));
      this._client.on("error", function(error) {
        self2.emit("error", error);
      });
      this._client.on("close", function() {
        self2.emit("close");
      });
      this._client.on("data", function onData(data) {
        self2._buffer = Buffer.concat([self2._buffer, data]);
        modbusSerialDebug({ action: "receive serial rtu buffered port", data, buffer: self2._buffer });
        const expectedLength = self2._length;
        let bufferLength = self2._buffer.length;
        if (expectedLength !== LENGTH_UNKNOWN && expectedLength < MIN_DATA_LENGTH || bufferLength < EXCEPTION_LENGTH) {
          return;
        }
        if (bufferLength > MAX_BUFFER_LENGTH) {
          self2._buffer = self2._buffer.slice(-MAX_BUFFER_LENGTH);
          bufferLength = MAX_BUFFER_LENGTH;
        }
        const maxOffset = bufferLength - EXCEPTION_LENGTH;
        for (let i = 0; i <= maxOffset; i++) {
          const unitId = self2._buffer[i];
          const functionCode = self2._buffer[i + 1];
          if (unitId !== self2._id) continue;
          if (functionCode === self2._cmd && functionCode === READ_DEVICE_IDENTIFICATION_FUNCTION_CODE) {
            if (bufferLength <= BITS_TO_NUM_OF_OBJECTS + i) {
              return;
            }
            const numObjects = self2._buffer[7 + i];
            const result = calculateFC43Length(self2._buffer, numObjects, i, bufferLength);
            if (result.hasAllData) {
              self2._emitData(i, result.bufLength);
              return;
            }
          } else if (functionCode === self2._cmd && functionCode === REPORT_SERVER_ID_FUNCTION_CODE) {
            const contentLength = self2._buffer[i + 2];
            self2._emitData(i, contentLength + 5);
            return;
          } else {
            if (functionCode === self2._cmd && i + expectedLength <= bufferLength) {
              self2._emitData(i, expectedLength);
              return;
            }
            if (functionCode === (128 | self2._cmd) && i + EXCEPTION_LENGTH <= bufferLength) {
              self2._emitData(i, EXCEPTION_LENGTH);
              return;
            }
          }
          if (functionCode === (127 & self2._cmd)) break;
        }
      });
    }
    /**
     * Check if port is open.
     *
     * @returns {boolean}
     */
    get isOpen() {
      return this._client.isOpen;
    }
    /**
     * Emit the received response, cut the buffer and reset the internal vars.
     *
     * @param {number} start The start index of the response within the buffer.
     * @param {number} length The length of the response.
     * @private
     */
    _emitData(start, length) {
      const buffer = this._buffer.slice(start, start + length);
      modbusSerialDebug({ action: "emit data serial rtu buffered port", buffer });
      this.emit("data", buffer);
      this._buffer = this._buffer.slice(start + length);
    }
    /**
     * Simulate successful port open.
     *
     * @param callback
     */
    open(callback) {
      this._client.open(callback);
    }
    /**
     * Simulate successful close port.
     *
     * @param callback
     */
    close(callback) {
      this._client.close(callback);
      this.removeAllListeners("data");
    }
    /**
     * Send data to a modbus slave.
     *
     * @param {Buffer} data
     */
    write(data) {
      if (data.length < MIN_WRITE_DATA_LENGTH) {
        modbusSerialDebug("expected length of data is to small - minimum is " + MIN_WRITE_DATA_LENGTH);
        return;
      }
      let length;
      this._id = data[0];
      this._cmd = data[1];
      switch (this._cmd) {
        case 1:
        case 2:
          length = data.readUInt16BE(4);
          this._length = 3 + parseInt((length - 1) / 8 + 1) + 2;
          break;
        case 3:
        case 4:
          length = data.readUInt16BE(4);
          this._length = 3 + 2 * length + 2;
          break;
        case 5:
        case 6:
        case 15:
        case 16:
          this._length = 6 + 2;
          break;
        case 17:
          this._length = LENGTH_UNKNOWN;
          break;
        case 43:
          this._length = LENGTH_UNKNOWN;
          break;
        default:
          this._length = 0;
          break;
      }
      this._client.write(data);
      modbusSerialDebug({
        action: "send serial rtu buffered",
        data,
        unitid: this._id,
        functionCode: this._cmd,
        length: this._length
      });
    }
  }
  rtubufferedport = RTUBufferedPort;
  return rtubufferedport;
}
var lrc;
var hasRequiredLrc;
function requireLrc() {
  if (hasRequiredLrc) return lrc;
  hasRequiredLrc = 1;
  lrc = function lrc2(buffer) {
    let lrc3 = 0;
    for (let i = 0; i < buffer.length; i++) {
      lrc3 += buffer[i] & 255;
    }
    return (lrc3 ^ 255) + 1 & 255;
  };
  return lrc;
}
var asciiport;
var hasRequiredAsciiport;
function requireAsciiport() {
  if (hasRequiredAsciiport) return asciiport;
  hasRequiredAsciiport = 1;
  const events = require$$0$3;
  const EventEmitter = events.EventEmitter || events;
  const SerialPort = requireDist().SerialPort;
  const modbusSerialDebug = srcExports("modbus-serial");
  const crc16$1 = crc16;
  const calculateLrc = requireLrc();
  const MIN_DATA_LENGTH = 6;
  function _asciiEncodeRequestBuffer(buf) {
    buf.writeUInt8(calculateLrc(buf.slice(0, -2)), buf.length - 2);
    const bufAscii = Buffer.alloc(buf.length * 2 + 1);
    bufAscii.write(":", 0);
    bufAscii.write(buf.toString("hex", 0, buf.length - 1).toUpperCase(), 1);
    bufAscii.write("\r", bufAscii.length - 2);
    bufAscii.write("\n", bufAscii.length - 1);
    return bufAscii;
  }
  function _asciiDecodeResponseBuffer(bufAscii) {
    const bufDecoded = Buffer.alloc((bufAscii.length - 1) / 2);
    for (let i = 0; i < (bufAscii.length - 3) / 2; i++) {
      bufDecoded.write(String.fromCharCode(bufAscii.readUInt8(i * 2 + 1), bufAscii.readUInt8(i * 2 + 2)), i, 1, "hex");
    }
    const lrcIn = bufDecoded.readUInt8(bufDecoded.length - 2);
    if (calculateLrc(bufDecoded.slice(0, -2)) !== lrcIn) {
      const calcLrc = calculateLrc(bufDecoded.slice(0, -2));
      modbusSerialDebug({ action: "LRC error", LRC: lrcIn.toString(16), calcLRC: calcLrc.toString(16) });
      return null;
    }
    bufDecoded.writeUInt16LE(crc16$1(bufDecoded.slice(0, -2)), bufDecoded.length - 2);
    return bufDecoded;
  }
  function _checkData(modbus, buf) {
    if (buf.length !== modbus._length && buf.length !== 5) {
      modbusSerialDebug({ action: "length error", receive: buf.length, expected: modbus._length });
      return false;
    }
    return buf[0] === modbus._id && (127 & buf[1]) === modbus._cmd;
  }
  class AsciiPort extends EventEmitter {
    /**
     * Simulate a modbus-ascii port using serial connection.
     *
     * @param path
     * @param options
     * @constructor
     */
    constructor(path2, options) {
      super();
      const modbus = this;
      options = options || {};
      this._startOfSlaveFrameChar = options.startOfSlaveFrameChar === void 0 ? 58 : options.startOfSlaveFrameChar;
      options.autoOpen = false;
      this._buffer = Buffer.from("");
      this._id = 0;
      this._cmd = 0;
      this._length = 0;
      this._client = new SerialPort(Object.assign({}, { path: path2 }, options));
      this._client.on("data", function(data) {
        modbus._buffer = Buffer.concat([modbus._buffer, data]);
        modbusSerialDebug({ action: "receive serial ascii port", data, buffer: modbus._buffer });
        modbusSerialDebug(JSON.stringify({ action: "receive serial ascii port strings", data, buffer: modbus._buffer }));
        const sdIndex = modbus._buffer.indexOf(modbus._startOfSlaveFrameChar);
        if (sdIndex === -1) {
          modbus._buffer = Buffer.from("");
          return;
        }
        if (sdIndex > 0) {
          modbus._buffer = modbus._buffer.slice(sdIndex);
        }
        if (modbus._buffer.includes("\r\n", 1, "ascii") === true) {
          const edIndex = modbus._buffer.indexOf(10);
          if (edIndex !== modbus._buffer.length - 1) {
            modbus._buffer = modbus._buffer.slice(0, edIndex + 1);
          }
          const _data = _asciiDecodeResponseBuffer(modbus._buffer);
          modbusSerialDebug({ action: "got EOM", data: _data, buffer: modbus._buffer });
          if (_data !== null) {
            if (_checkData(modbus, _data)) {
              modbusSerialDebug({ action: "emit data serial ascii port", data, buffer: modbus._buffer });
              modbusSerialDebug(JSON.stringify({ action: "emit data serial ascii port strings", data, buffer: modbus._buffer }));
              modbus.emit("data", _data);
            }
          }
          modbus._buffer = Buffer.from("");
        }
      });
    }
    /**
     * Check if port is open.
     *
     * @returns {boolean}
     */
    get isOpen() {
      return this._client.isOpen;
    }
    /**
     * Simulate successful port open.
     *
     * @param callback
     */
    open(callback) {
      this._client.open(callback);
    }
    /**
     * Simulate successful close port.
     *
     * @param callback
     */
    close(callback) {
      this._client.close(callback);
      this.removeAllListeners();
    }
    /**
     * Send data to a modbus slave.
     *
     * @param data
     */
    write(data) {
      if (data.length < MIN_DATA_LENGTH) {
        modbusSerialDebug("expected length of data is to small - minimum is " + MIN_DATA_LENGTH);
        return;
      }
      let length;
      this._id = data[0];
      this._cmd = data[1];
      switch (this._cmd) {
        case 1:
        case 2:
          length = data.readUInt16BE(4);
          this._length = 3 + parseInt((length - 1) / 8 + 1) + 2;
          break;
        case 3:
        case 4:
          length = data.readUInt16BE(4);
          this._length = 3 + 2 * length + 2;
          break;
        case 5:
        case 6:
        case 15:
        case 16:
          this._length = 6 + 2;
          break;
        default:
          modbusSerialDebug({ action: "unknown command", id: this._id.toString(16), command: this._cmd.toString(16) });
          this._length = 0;
          break;
      }
      const _encodedData = _asciiEncodeRequestBuffer(data);
      this._client.write(_encodedData);
      modbusSerialDebug({
        action: "send serial ascii port",
        data: _encodedData,
        unitid: this._id,
        functionCode: this._cmd
      });
      modbusSerialDebug(JSON.stringify({
        action: "send serial ascii port",
        data: _encodedData,
        unitid: this._id,
        functionCode: this._cmd
      }));
    }
  }
  asciiport = AsciiPort;
  return asciiport;
}
var bleport;
var hasRequiredBleport;
function requireBleport() {
  if (hasRequiredBleport) return bleport;
  hasRequiredBleport = 1;
  const { EventEmitter } = require$$0$3;
  const debug = srcExports("modbus-serial");
  class BlePort extends EventEmitter {
    constructor(options) {
      super();
      if (typeof options === "undefined") options = {};
      this._bluetooth = options.bluetooth || navigator.bluetooth;
      this._txServiceUuid = options.txService;
      this._txCharacteristicUuid = options.txCharacteristic;
      this._rxServiceUuid = options.rxService;
      this._rxCharacteristicUuid = options.rxCharacteristic;
      this._boundHandleDisconnection = this._handleDisconnection.bind(this);
      this._boundHandleCharacteristicValueChanged = this._handleCharacteristicValueChanged.bind(this);
    }
    get isOpen() {
      return Boolean(this._device) && this._device.gatt.connected;
    }
    async open(callback) {
      let error;
      try {
        const options = {
          filters: [{ services: [this._txServiceUuid] }],
          optionalServices: [this._txServiceUuid, this._rxServiceUuid]
        };
        debug({ action: "requesting BLE device", options });
        this._device = await this._bluetooth.requestDevice(options);
        debug({ action: "BLE device connected", name: this._device.name, id: this._device.id });
        this._device.addEventListener("gattserverdisconnected", this._boundHandleDisconnection);
        debug({ action: "Connecting to GATT server" });
        this._server = await this._device.gatt.connect();
        debug({ action: "GATT server connected" });
        debug({ action: "Getting TX service", uuid: this._txServiceUuid });
        this._txService = await this._server.getPrimaryService(this._txServiceUuid);
        debug({ action: "TX service found" });
        debug({ action: "Getting TX characteristic", uuid: this._txCharacteristicUuid });
        this._txCharacteristic = await this._txService.getCharacteristic(this._txCharacteristicUuid);
        debug({ action: "TX characteristic found" });
        debug({ action: "Getting RX service", uuid: this._rxServiceUuid });
        this._rxService = await this._server.getPrimaryService(this._rxServiceUuid);
        debug({ action: "RX service found" });
        debug({ action: "Getting RX characteristic", uuid: this._rxCharacteristicUuid });
        this._rxCharacteristic = await this._rxService.getCharacteristic(this._rxCharacteristicUuid);
        debug({ action: "RX characteristic found" });
        debug({ action: "Starting RX notifications" });
        await this._rxCharacteristic.startNotifications();
        debug({ action: "RX notifications started" });
        this._rxCharacteristic.addEventListener("characteristicvaluechanged", this._boundHandleCharacteristicValueChanged);
      } catch (_error) {
        error = _error;
      }
      if (callback) {
        callback(error);
      }
    }
    async close(callback) {
      let error;
      try {
        if (this._rxCharacteristic) {
          debug({ action: "Stopping RX notifications" });
          await this._rxCharacteristic.stopNotifications();
          debug({ action: "RX notifications stopped" });
          this._rxCharacteristic.removeEventListener("characteristicvaluechanged", this._boundHandleCharacteristicValueChanged);
        }
        if (this._device) {
          debug({ action: "Disconnecting from GATT server" });
          this._device.removeEventListener("gattserverdisconnected", this._boundHandleDisconnection);
          if (this._device.gatt.connected) {
            this._device.gatt.disconnect();
            debug({ action: "GATT server disconnected" });
          } else {
            debug({ action: "GATT server is already disconnected" });
          }
        }
      } catch (_error) {
        error = _error;
      }
      if (callback) {
        callback(error);
      }
    }
    /**
     * Writes raw data to the TX characteristic.
     * @param {Buffer} data
     * @returns {Promise}
     */
    async write(data) {
      debug({ action: "Writing to TX characteristic", data });
      await this._txCharacteristic.writeValue(BlePort._bufferToArrayBuffer(data));
    }
    _handleDisconnection() {
      debug({ action: "GATT server disconnected" });
      this.emit("close");
    }
    /**
     * Handles a received GATT value change event.
     * @param event
     * @private
     */
    _handleCharacteristicValueChanged(event) {
      const dataView = event.target.value;
      const buffer = Buffer.from(dataView.buffer, dataView.byteOffset, dataView.byteLength);
      debug({ action: "RX characteristic changed", buffer });
      this.emit("data", buffer);
    }
    /**
     * Converts a Node.js `Buffer` to an `ArrayBuffer`.
     * @param {Buffer} buffer
     * @returns {ArrayBuffer}
     * @private
     */
    static _bufferToArrayBuffer(buffer) {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
  }
  bleport = BlePort;
  return bleport;
}
var connection;
var hasRequiredConnection;
function requireConnection() {
  if (hasRequiredConnection) return connection;
  hasRequiredConnection = 1;
  const MIN_MODBUSRTU_FRAMESZ = 5;
  const addConnectionAPI = function(Modbus) {
    const cl = Modbus.prototype;
    const open = function(obj, next) {
      if (next) {
        obj.open(next);
      } else {
        return new Promise(function(resolve, reject) {
          function cb(err) {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
          obj.open(cb);
        });
      }
    };
    cl.connectRTU = function(path2, options, next) {
      if (options) {
        this._enron = options.enron;
        this._enronTables = options.enronTables;
      }
      if (typeof next === "undefined" && typeof options === "function") {
        next = options;
        options = {};
      }
      if (typeof options === "undefined") {
        options = {};
      }
      options.autoOpen = false;
      options.platformOptions = { vmin: MIN_MODBUSRTU_FRAMESZ, vtime: 0 };
      const SerialPort = requireDist().SerialPort;
      this._port = new SerialPort(Object.assign({}, { path: path2 }, options));
      return open(this, next);
    };
    cl.connectTCP = function(ip, options, next) {
      if (options) {
        this._enron = options.enron;
        this._enronTables = options.enronTables;
      }
      if (typeof next === "undefined" && typeof options === "function") {
        next = options;
        options = {};
      }
      if (typeof options === "undefined") {
        options = {};
      }
      const TcpPort = requireTcpport();
      if (this._timeout) {
        options.timeout = this._timeout;
      }
      this._port = new TcpPort(ip, options);
      return open(this, next);
    };
    cl.linkTCP = function(socket, options, next) {
      if (typeof next === "undefined" && typeof options === "function") {
        next = options;
        options = {};
      }
      if (typeof options === "undefined") {
        options = {};
      }
      options.socket = socket;
      const TcpPort = requireTcpport();
      if (this._timeout) {
        options.timeout = this._timeout;
      }
      this._port = new TcpPort(options);
      return open(this, next);
    };
    cl.connectTcpRTUBuffered = function(ip, options, next) {
      if (typeof next === "undefined" && typeof options === "function") {
        next = options;
        options = {};
      }
      if (typeof options === "undefined") {
        options = {};
      }
      const TcpRTUBufferedPort = requireTcprtubufferedport();
      if (this._timeout) {
        options.timeout = this._timeout;
      }
      this._port = new TcpRTUBufferedPort(ip, options);
      return open(this, next);
    };
    cl.linkTcpRTUBuffered = function(socket, options, next) {
      if (typeof next === "undefined" && typeof options === "function") {
        next = options;
        options = {};
      }
      if (typeof options === "undefined") {
        options = {};
      }
      options.socket = socket;
      const TcpRTUBufferedPort = requireTcprtubufferedport();
      if (this._timeout) {
        options.timeout = this._timeout;
      }
      this._port = new TcpRTUBufferedPort(options);
      return open(this, next);
    };
    cl.connectTelnet = function(ip, options, next) {
      if (typeof next === "undefined" && typeof options === "function") {
        next = options;
        options = {};
      }
      if (typeof options === "undefined") {
        options = {};
      }
      const TelnetPort = requireTelnetport();
      if (this._timeout) {
        options.timeout = this._timeout;
      }
      this._port = new TelnetPort(ip, options);
      return open(this, next);
    };
    cl.linkTelnet = function(socket, options, next) {
      if (typeof next === "undefined" && typeof options === "function") {
        next = options;
        options = {};
      }
      if (typeof options === "undefined") {
        options = {};
      }
      options.socket = socket;
      const TelnetPort = requireTelnetport();
      if (this._timeout) {
        options.timeout = this._timeout;
      }
      this._port = new TelnetPort(options);
      return open(this, next);
    };
    cl.connectC701 = function(ip, options, next) {
      if (typeof next === "undefined" && typeof options === "function") {
        next = options;
        options = {};
      }
      if (typeof options === "undefined") {
        options = {};
      }
      const C701Port = requireC701port();
      this._port = new C701Port(ip, options);
      return open(this, next);
    };
    cl.connectUDP = function(ip, options, next) {
      if (typeof next === "undefined" && typeof options === "function") {
        next = options;
        options = {};
      }
      if (typeof options === "undefined") {
        options = {};
      }
      const UdpPort = requireUdpport();
      this._port = new UdpPort(ip, options);
      return open(this, next);
    };
    cl.connectRTUBuffered = function(path2, options, next) {
      if (options) {
        this._enron = options.enron;
        this._enronTables = options.enronTables;
      }
      if (typeof next === "undefined" && typeof options === "function") {
        next = options;
        options = {};
      }
      if (typeof options === "undefined") {
        options = {};
      }
      const SerialPort = requireRtubufferedport();
      this._port = new SerialPort(path2, options);
      options.platformOptions = { vmin: MIN_MODBUSRTU_FRAMESZ, vtime: 0 };
      return open(this, next);
    };
    cl.connectAsciiSerial = function(path2, options, next) {
      if (typeof next === "undefined" && typeof options === "function") {
        next = options;
        options = {};
      }
      if (typeof options === "undefined") {
        options = {};
      }
      const SerialPortAscii = requireAsciiport();
      this._port = new SerialPortAscii(path2, options);
      return open(this, next);
    };
    cl.connectRTUSocket = function(socket, next) {
      const thisModbus = this;
      this._port = socket;
      this._port.open = function(callback) {
        thisModbus._port.isOpen = true;
        callback();
      };
      return open(this, next);
    };
    cl.connectBle = function(options, next) {
      if (typeof next === "undefined" && typeof options === "function") {
        next = options;
        options = {};
      }
      if (typeof options === "undefined") {
        options = {};
      }
      const BlePort = requireBleport();
      if (this._timeout) {
        options.timeout = this._timeout;
      }
      this._port = new BlePort(options);
      return open(this, next);
    };
  };
  connection = addConnectionAPI;
  return connection;
}
var promise;
var hasRequiredPromise;
function requirePromise() {
  if (hasRequiredPromise) return promise;
  hasRequiredPromise = 1;
  const _convert = function(f) {
    const converted = function(...args) {
      const client = this;
      const id = this._unitID;
      const next = args[args.length - 1];
      const hasCallback = typeof next === "function";
      if (hasCallback) {
        if (args.length === 1) {
          f.bind(client)(next);
        } else {
          f.bind(client)(id, ...args);
        }
      } else {
        return new Promise(function(resolve, reject) {
          function cb(err, data) {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          }
          if (args.length === 0) {
            f.bind(client)(cb);
          } else {
            f.bind(client)(id, ...args, cb);
          }
        });
      }
    };
    return converted;
  };
  const addPromiseAPI = function(Modbus) {
    const cl = Modbus.prototype;
    cl.setID = function(id) {
      this._unitID = Number(id);
    };
    cl.getID = function() {
      return this._unitID;
    };
    cl.setTimeout = function(timeout) {
      this._timeout = timeout;
    };
    cl.getTimeout = function() {
      return this._timeout;
    };
    cl.close = _convert(cl.close);
    cl.readCoils = _convert(cl.writeFC1);
    cl.readDiscreteInputs = _convert(cl.writeFC2);
    cl.readHoldingRegisters = _convert(cl.writeFC3);
    cl.readRegistersEnron = _convert(cl.writeFC3);
    cl.readInputRegisters = _convert(cl.writeFC4);
    cl.writeCoil = _convert(cl.writeFC5);
    cl.writeRegister = _convert(cl.writeFC6);
    cl.writeRegisterEnron = _convert(cl.writeFC6);
    cl.writeCoils = _convert(cl.writeFC15);
    cl.writeRegisters = _convert(cl.writeFC16);
    cl.reportServerID = _convert(cl.writeFC17);
    cl.readFileRecords = _convert(cl.writeFC20);
    cl.maskWriteRegister = _convert(cl.writeFC22);
    cl.readWriteRegisters = _convert(cl.writeFC23);
    cl.readDeviceIdentification = _convert(cl.writeFC43);
    cl.customFunction = _convert(cl.writeCustomFC);
  };
  promise = addPromiseAPI;
  return promise;
}
var worker$1;
var hasRequiredWorker$1;
function requireWorker$1() {
  if (hasRequiredWorker$1) return worker$1;
  hasRequiredWorker$1 = 1;
  function getByteLength(type) {
    switch (String(type).toLowerCase()) {
      case "int16":
      case "uint16":
        return 2;
      case "int32":
      case "uint32":
      case "float":
        return 4;
      default:
        throw new Error("Unsupported type");
    }
  }
  function send({ fc, unit, address, arg }) {
    this._port.setID(unit);
    switch (fc) {
      case 1:
        return this._port.readCoils(address, arg);
      case 2:
        return this._port.readDiscreteInputs(address, arg);
      case 3:
        return this._port.readHoldingRegisters(address, arg);
      case 4:
        return this._port.readInputRegisters(address, arg);
      case 5:
        return this._port.writeCoil(address, arg);
      case 6:
        return this._port.writeRegister(address, arg);
      case 15:
        return this._port.writeCoils(address, arg);
      case 16:
        return this._port.writeRegisters(address, arg);
    }
    return Promise.reject(new Error("Unknown fc code"));
  }
  const Worker = function(port, options) {
    if (typeof options === "undefined") options = {};
    this.maxConcurrentRequests = 1;
    this.debug = false;
    this._port = port;
    this._queue = [];
    this._scheduled = [];
    this._running = /* @__PURE__ */ new Map();
    this._nextId = 0;
    this.setOptions(options);
  };
  Worker.prototype.setOptions = function({ maxConcurrentRequests, debug }) {
    if (maxConcurrentRequests > 0) {
      this.maxConcurrentRequests = maxConcurrentRequests;
    }
    if (debug !== void 0) {
      this.debug = Boolean(debug);
    }
  };
  Worker.prototype.log = function(...args) {
    if (this.debug === true) {
      args.unshift(/* @__PURE__ */ new Date());
      console.log(...args);
    }
  };
  Worker.prototype.emit = function(name2, data) {
    this._port.emit(name2, data);
  };
  Worker.prototype.bufferize = function(data, type) {
    if (Array.isArray(data) === false) {
      data = [data];
    }
    const quantity = data.length;
    const byteLength = getByteLength(type);
    const size = quantity * byteLength;
    const buffer = Buffer.alloc(size);
    for (let i = 0; i < quantity; i++) {
      if (type === "int16") {
        buffer.writeInt16BE(data[i], i * byteLength);
      } else if (type === "uint16") {
        buffer.writeUInt16BE(data[i], i * byteLength);
      } else if (type === "int32") {
        buffer.writeInt32BE(data[i], i * byteLength);
      } else if (type === "uint32") {
        buffer.writeUInt32BE(data[i], i * byteLength);
      } else if (type === "float") {
        buffer.writeFloatBE(data[i], i * byteLength);
      }
    }
    return buffer;
  };
  Worker.prototype.unbufferize = function(buffer, type) {
    const byteLength = getByteLength(type);
    const quantity = buffer.length / byteLength;
    const data = [];
    for (let i = 0; i < quantity; i++) {
      if (type === "int16") {
        data.push(buffer.readInt16BE(i * byteLength));
      } else if (type === "uint16") {
        data.push(buffer.readUInt16BE(i * byteLength));
      } else if (type === "int32") {
        data.push(buffer.readInt32BE(i * byteLength));
      } else if (type === "uint32") {
        data.push(buffer.readUInt32BE(i * byteLength));
      } else if (type === "float") {
        data.push(buffer.readFloatBE(i * byteLength));
      }
    }
    return data;
  };
  Worker.prototype.nextId = function() {
    this._nextId = this._nextId + 1;
    if (this._nextId > 9999) {
      this._nextId = 1;
    }
    return this._nextId;
  };
  Worker.prototype.send = function({ fc, unit, address, value, quantity, arg, type }) {
    const promise2 = new Promise((resolve, reject) => {
      arg = arg || quantity || value;
      if (fc === 1 || fc === 2) {
        arg = arg || 1;
      }
      if (fc === 3 || fc === 4) {
        type = type || "int16";
        arg = (arg || 1) * getByteLength(type) / 2;
      }
      if (fc === 6 || fc === 16) {
        type = type || "int16";
        arg = this.bufferize(arg, type);
        if (fc === 6 && arg.length > 2) {
          fc = 16;
        }
      }
      if (fc === 5 && arg instanceof Array && arg.length > 1) {
        fc = 15;
      }
      const id = this.nextId();
      this.log("queue push", `#${id}`, fc, unit, address, arg, type);
      this._queue.push({ id, fc, unit, address, arg, type, resolve, reject });
    });
    this.process();
    return promise2;
  };
  Worker.prototype.process = function() {
    if (this._port.isOpen === false) {
      this._queue = [];
      this._scheduled = [];
      this._running = /* @__PURE__ */ new Map();
      this._nextId = 0;
      return;
    }
    setTimeout(() => this.run(), 1);
  };
  Worker.prototype.run = function() {
    if (this._running.size >= this.maxConcurrentRequests) {
      return;
    }
    let request = this._queue.shift();
    if (!request) {
      request = this._scheduled.shift();
    }
    if (!request) {
      return;
    }
    if (typeof request.checkBeforeQueuing === "function") {
      if (request.checkBeforeQueuing() === false) {
        return this.process();
      }
    }
    this._running.set(request.id, request);
    this.log("send", JSON.stringify(request));
    this.emit("request", { request });
    send.apply(this, [request]).then((response) => {
      let data = [];
      if (request.fc === 1 || request.fc === 2) {
        for (let i = 0; i < request.arg; i++) {
          data.push(Boolean(response.data[i]));
        }
      } else if (request.fc === 3 || request.fc === 4) {
        data = this.unbufferize(response.buffer, request.type);
      } else if (request.arg instanceof Array) {
        data = request.arg;
      } else if (request.arg instanceof Buffer && request.type) {
        data = this.unbufferize(request.arg, request.type);
      } else {
        data.push(request.arg);
      }
      this._running.delete(request.id);
      this.emit("response", { request, response: data });
      request.resolve(data);
      this.process();
    }).catch((error) => {
      this._running.delete(request.id);
      error.request = request;
      this.emit("failed", error);
      request.reject(error);
      this.process();
    });
    this.process();
  };
  Worker.prototype._poll_send = function(result, { i, fc, unit, address, arg, items, length, type }, { skipErrors }) {
    const promise2 = new Promise((res, rej) => {
      const id = this.nextId();
      this.log("scheduled push", "poll #" + result.id, "req #" + i, "#" + id, fc, length, type);
      const resolve = function(response) {
        const data = items.map((address2, index) => ({ address: address2, value: response[index] }));
        result._req += 1;
        result.done += 1;
        result.data = [...result.data, ...data];
        res(data);
      };
      const reject = function(error) {
        result._req += 1;
        result.error = error;
        rej(error);
      };
      const checkBeforeQueuing = function() {
        return result.error === null || skipErrors === true;
      };
      this._scheduled.push({ id, i, fc, unit, address, arg, items, length, type, result, checkBeforeQueuing, resolve, reject });
    });
    this.process();
    return promise2;
  };
  Worker.prototype.poll = function({ unit, map, onProgress, maxChunkSize, skipErrors, defaultType }) {
    maxChunkSize = maxChunkSize || 32;
    skipErrors = Boolean(skipErrors);
    defaultType = defaultType || "int16";
    if (unit < 1 || unit > 250 || isNaN(unit) || unit === void 0) {
      throw new Error("invalid unit");
    }
    this.log("poll", `unit=${unit}`, "map size=" + Object.keys(map).length, `maxChunkSize=${maxChunkSize}`, `skipErrors=${skipErrors}`);
    const result = {
      id: this.nextId(),
      unit,
      total: 0,
      done: 0,
      data: [],
      error: null,
      dt: Date.now(),
      _req: 0
    };
    const registers = [];
    map.forEach(({ fc, address, type }) => {
      fc = parseInt(fc);
      if (fc === 3 || fc === 4) {
        type = type || defaultType;
      } else if (fc === 1 || fc === 2) {
        type = "bool";
      } else {
        throw new Error("unsupported fc");
      }
      if (address instanceof Array) {
        address.forEach((item) => {
          registers.push({ fc, address: parseInt(item), type: type || null });
        });
      } else {
        address = parseInt(address);
        registers.push({ fc, address, type: type || null });
      }
    });
    registers.sort((a, b) => {
      if (a.fc === b.fc) {
        return a.address - b.address;
      }
      return a.fc - b.fc;
    });
    const requests = registers.reduce(function(chunks, register, i, arr) {
      let chunk = 0;
      if (chunks.length) {
        chunk = chunks.length - 1;
      }
      if (i > 0) {
        const lastRegister = arr[i - 1];
        if (lastRegister.fc !== register.fc) {
          chunk += 1;
        } else if (lastRegister.type !== register.type) {
          chunk += 1;
        } else if ([3, 4].indexOf(register.fc) >= 0 && register.address - lastRegister.address !== getByteLength(register.type) / 2) {
          chunk += 1;
        } else if (chunks[chunk].items.length >= maxChunkSize) {
          chunk += 1;
        }
      }
      if (chunks[chunk] === void 0) {
        chunks[chunk] = {
          fc: register.fc,
          items: [],
          length: 0,
          type: register.type
        };
      }
      chunks[chunk].items.push(register.address);
      if ([3, 4].indexOf(register.fc) >= 0) {
        chunks[chunk].length += getByteLength(register.type) / 2;
      } else {
        chunks[chunk].length += 1;
      }
      return chunks;
    }, []);
    result.total = requests.length;
    return new Promise((resolve) => {
      const check = function() {
        if (result._req === result.total) {
          result.dt = Date.now() - result.dt;
          resolve(result);
        } else if (result.error && skipErrors !== true) {
          result.dt = Date.now() - result.dt;
          resolve(result);
        }
      };
      for (let i = 0; i < requests.length; i++) {
        const { fc, items, length, type } = requests[i];
        this._poll_send(result, { i, unit, fc, address: parseInt(items[0]), items, arg: length, length, type }, {
          skipErrors
        }).then((data) => {
          if (typeof onProgress === "function") {
            onProgress(result.done / result.total, data);
          }
          check();
        }).catch(() => check());
      }
    });
  };
  worker$1 = Worker;
  return worker$1;
}
var worker;
var hasRequiredWorker;
function requireWorker() {
  if (hasRequiredWorker) return worker;
  hasRequiredWorker = 1;
  const Worker = requireWorker$1();
  worker = function(Modbus) {
    const cl = Modbus.prototype;
    cl.setWorkerOptions = function(options) {
      if (this._worker) {
        this._worker.setOptions(options);
      } else {
        this._worker = new Worker(this, options);
      }
    };
    cl.send = function(request) {
      if (!this._worker) {
        this._worker = new Worker(this);
      }
      return this._worker.send(request);
    };
    cl.poll = function(options) {
      if (!this._worker) {
        this._worker = new Worker(this);
      }
      return this._worker.poll(options);
    };
  };
  return worker;
}
var testport;
var hasRequiredTestport;
function requireTestport() {
  if (hasRequiredTestport) return testport;
  hasRequiredTestport = 1;
  const events = require$$0$3;
  const EventEmitter = events.EventEmitter || events;
  const modbusSerialDebug = srcExports("modbus-serial");
  buffer_bit();
  const crc16$1 = crc16;
  const MIN_DATA_LENGTH = 7;
  class TestPort extends EventEmitter {
    /**
     * Simulate a serial port with 4 modbus-rtu slaves connected.
     *
     * 1 - a modbus slave working correctly
     * 2 - a modbus slave that answer short replays
     * 3 - a modbus slave that answer with bad crc
     * 4 - a modbus slave that answer with bad unit number
     * 5 - a modbus slave that answer with an exception
     * 6 - a modbus slave that times out (does not answer)
     */
    constructor() {
      super();
      this._registers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      this._holding_registers = [0, 0, 0, 0, 0, 0, 0, 0, 41259, 65535, 45594];
      this._coils = 0;
    }
    /**
     * Check if port is open.
     *
     * @returns {boolean}
     */
    get isOpen() {
      return true;
    }
    /**
     * Simulate successful port open.
     *
     * @param callback
     */
    open(callback) {
      if (callback)
        callback(null);
    }
    /**
     * Simulate successful close port.
     *
     * @param callback
     */
    close(callback) {
      if (callback)
        callback(null);
    }
    /**
     * Simulate successful/failure port requests and replays.
     *
     * @param {Buffer} data
     */
    write(data) {
      let buffer;
      let length;
      let address;
      let value;
      let state;
      let i;
      if (data.length < MIN_DATA_LENGTH) {
        modbusSerialDebug("expected length of data is to small - minimum is " + MIN_DATA_LENGTH);
        return;
      }
      const unitNumber = data[0];
      const functionCode = data[1];
      let crc = data[data.length - 2] + data[data.length - 1] * 256;
      if (crc !== crc16$1(data.slice(0, -2))) {
        return;
      }
      if (functionCode === 1 || functionCode === 2) {
        address = data.readUInt16BE(2);
        length = data.readUInt16BE(4);
        if (data.length !== 8) {
          return;
        }
        buffer = Buffer.alloc(3 + parseInt((length - 1) / 8 + 1) + 2);
        buffer.writeUInt8(parseInt((length - 1) / 8 + 1), 2);
        buffer.writeUInt16LE(this._coils >> address, 3);
      }
      if (functionCode === 3) {
        address = data.readUInt16BE(2);
        length = data.readUInt16BE(4);
        if (data.length !== 8) {
          return;
        }
        buffer = Buffer.alloc(3 + length * 2 + 2);
        buffer.writeUInt8(length * 2, 2);
        for (i = 0; i < length; i++) {
          buffer.writeUInt16BE(this._holding_registers[address + i], 3 + i * 2);
        }
      }
      if (functionCode === 4) {
        address = data.readUInt16BE(2);
        length = data.readUInt16BE(4);
        if (data.length !== 8) {
          return;
        }
        buffer = Buffer.alloc(3 + length * 2 + 2);
        buffer.writeUInt8(length * 2, 2);
        for (i = 0; i < length; i++) {
          buffer.writeUInt16BE(this._registers[address + i], 3 + i * 2);
        }
      }
      if (functionCode === 5) {
        address = data.readUInt16BE(2);
        state = data.readUInt16BE(4);
        if (data.length !== 8) {
          return;
        }
        buffer = Buffer.alloc(8);
        buffer.writeUInt16BE(address, 2);
        buffer.writeUInt16BE(state, 4);
        if (state === 65280) {
          this._coils |= 1 << address;
        } else {
          this._coils &= ~(1 << address);
        }
      }
      if (functionCode === 6) {
        address = data.readUInt16BE(2);
        value = data.readUInt16BE(4);
        if (data.length !== 6 + 2) {
          return;
        }
        buffer = Buffer.alloc(8);
        buffer.writeUInt16BE(address, 2);
        buffer.writeUInt16BE(value, 4);
        this._holding_registers[address] = value;
      }
      if (functionCode === 15) {
        address = data.readUInt16BE(2);
        length = data.readUInt16BE(4);
        if (data.length !== 7 + Math.ceil(length / 8) + 2) {
          return;
        }
        buffer = Buffer.alloc(8);
        buffer.writeUInt16BE(address, 2);
        buffer.writeUInt16BE(length, 4);
        for (i = 0; i < length; i++) {
          state = data.readBit(i, 7);
          if (state) {
            this._coils |= 1 << address + i;
          } else {
            this._coils &= ~(1 << address + i);
          }
        }
      }
      if (functionCode === 16) {
        address = data.readUInt16BE(2);
        length = data.readUInt16BE(4);
        if (data.length !== 7 + length * 2 + 2) {
          return;
        }
        buffer = Buffer.alloc(8);
        buffer.writeUInt16BE(address, 2);
        buffer.writeUInt16BE(length, 4);
        for (i = 0; i < length; i++) {
          this._holding_registers[address + i] = data.readUInt16BE(7 + i * 2);
        }
      }
      if (functionCode === 22) {
        address = data.readUInt16BE(2);
        const andMask = data.readUInt16BE(4);
        const orMask = data.readUInt16BE(6);
        if (data.length !== 10) {
          return;
        }
        const oldValue = this._holding_registers[address] || 0;
        this._holding_registers[address] = oldValue & andMask | orMask & ~andMask;
        buffer = Buffer.alloc(10);
        buffer.writeUInt16BE(address, 2);
        buffer.writeUInt16BE(andMask, 4);
        buffer.writeUInt16BE(orMask, 6);
      }
      if (functionCode === 43) {
        const productCode = "MyProductCode1234";
        buffer = Buffer.alloc(12 + productCode.length);
        buffer.writeUInt8(16, 2);
        buffer.writeUInt8(data.readInt8(3), 3);
        buffer.writeUInt8(1, 4);
        buffer.writeUInt8(0, 5);
        buffer.writeUInt8(0, 6);
        buffer.writeUInt8(1, 7);
        buffer.writeUInt8(data.readInt8(4), 8);
        buffer.writeUInt8(productCode.length, 9);
        buffer.write(productCode, 10, productCode.length, "ascii");
      }
      if (functionCode === 100) {
        buffer = Buffer.alloc(data.length);
        for (let i2 = 2; i2 < data.length - 2; i2++) {
          buffer.writeUInt8(data.readUInt8(i2) * 2, i2);
        }
      }
      if (buffer) {
        buffer.writeUInt8(unitNumber, 0);
        buffer.writeUInt8(functionCode, 1);
        switch (unitNumber) {
          case 1:
            break;
          case 2:
            buffer = buffer.slice(0, buffer.length - 5);
            break;
          case 4:
            buffer[0] = unitNumber + 2;
            break;
          case 5:
            buffer.writeUInt8(functionCode + 128, 1);
            buffer.writeUInt8(4, 2);
            buffer = buffer.slice(0, 5);
            break;
          case 6:
            return;
        }
        crc = crc16$1(buffer.slice(0, -2));
        buffer.writeUInt16LE(crc, buffer.length - 2);
        if (unitNumber === 3) {
          buffer.writeUInt16LE(crc + 1, buffer.length - 2);
        }
        this.emit("data", buffer);
        modbusSerialDebug({
          action: "send test port",
          data,
          buffer,
          unitid: unitNumber,
          functionCode
        });
        modbusSerialDebug(JSON.stringify({
          action: "send test port strings",
          data,
          buffer,
          unitid: unitNumber,
          functionCode
        }));
      }
    }
  }
  testport = TestPort;
  return testport;
}
const name = "modbus-serial";
const version = "8.0.25";
const description = "A pure JavaScript implementation of MODBUS-RTU (Serial and TCP) for NodeJS. The serialport package is an optional dependency (use npm install --no-optional to skip).";
const main = "index.js";
const types = "index.d.ts";
const files = [
  "index.js",
  "apis",
  "ports",
  "servers",
  "utils",
  "worker",
  "index.d.ts",
  "ModbusRTU.d.ts",
  "ServerTCP.d.ts",
  "ServerSerial.d.ts",
  "TestPort.d.ts",
  "README.md",
  "LICENSE"
];
const scripts = {
  test: "nyc --reporter=lcov --reporter=text mocha --recursive",
  lint: "eslint .",
  "lint:fix": "eslint . --fix",
  clean: "node scripts/clean.js",
  build: "node scripts/build-modbus-serial.js",
  doc: "jsdoc -c jsdoc.json",
  "doc:examples": "node scripts/copy-doc-examples.js",
  docs: "npm run doc && npm run doc:examples",
  "publish:prepare": "npm run build && npm run docs"
};
const repository = {
  type: "git",
  url: "git+https://github.com/yaacov/node-modbus-serial.git"
};
const keywords = [
  "modbus",
  "rtu",
  "serial",
  "port",
  "com",
  "arduino"
];
const author = "Yaacov Zamir <kobi.zamir@gmail.com>";
const license = "ISC";
const bugs = {
  url: "https://github.com/yaacov/node-modbus-serial/issues"
};
const homepage = "https://github.com/yaacov/node-modbus-serial#readme";
const devDependencies = {
  "@eslint/js": "^10.0.1",
  chai: "^6.2.2",
  "chai-as-promised": "^8.0.2",
  "clean-jsdoc-theme": "^4.3.0",
  eslint: "^10.0.3",
  globals: "^17.4.0",
  jsdoc: "^4.0.5",
  mocha: "^11.7.5",
  mockery: "^2.1.0",
  nyc: "^18.0.0",
  sinon: "^21.0.3",
  "web-bluetooth-mock": "^1.2.0",
  webbluetooth: "^3.6.0"
};
const dependencies = {
  debug: "^4.4.3"
};
const optionalDependencies = {
  serialport: "^13.0.0"
};
const require$$1 = {
  name,
  version,
  description,
  main,
  types,
  files,
  scripts,
  repository,
  keywords,
  author,
  license,
  bugs,
  homepage,
  devDependencies,
  dependencies,
  optionalDependencies
};
var servertcp_handler;
var hasRequiredServertcp_handler;
function requireServertcp_handler() {
  if (hasRequiredServertcp_handler) return servertcp_handler;
  hasRequiredServertcp_handler = 1;
  const modbusSerialDebug = srcExports("modbus-serial");
  function _errorRequestBufferLength(requestBuffer) {
    if (requestBuffer.length !== 8) {
      modbusSerialDebug("request Buffer length " + requestBuffer.length + " is wrong - has to be == 8");
      return true;
    }
    return false;
  }
  function _errorRequestBufferLengthEnron(requestBuffer) {
    if (requestBuffer.length !== 10) {
      modbusSerialDebug("request (Enron) Buffer length " + requestBuffer.length + " is wrong - has to be == 10");
      return true;
    }
    return false;
  }
  function _handlePromiseOrValue(promiseOrValue, cb) {
    if (promiseOrValue && promiseOrValue.then && typeof promiseOrValue.then === "function") {
      promiseOrValue.then(function(value) {
        cb(null, value);
      }).catch(function(err) {
        cb(err);
      });
    } else {
      cb(null, promiseOrValue);
    }
  }
  function _handleReadCoilsOrInputDiscretes(requestBuffer, vector, unitID, callback, fc) {
    const address = requestBuffer.readUInt16BE(2);
    const length = requestBuffer.readUInt16BE(4);
    if (_errorRequestBufferLength(requestBuffer)) {
      return;
    }
    const dataBytes = parseInt((length - 1) / 8 + 1);
    const responseBuffer = Buffer.alloc(3 + dataBytes + 2);
    try {
      responseBuffer.writeUInt8(dataBytes, 2);
    } catch (err) {
      callback(err);
      return;
    }
    const isGetCoil = fc === 1 && vector.getCoil;
    const isGetDiscreteInput = fc === 2 && vector.getDiscreteInput;
    if (isGetCoil || isGetDiscreteInput) {
      let callbackInvoked = false;
      let cbCount = 0;
      const buildCb = function(i2) {
        return function(err, value) {
          if (err) {
            if (!callbackInvoked) {
              callbackInvoked = true;
              callback(err);
            }
            return;
          }
          cbCount = cbCount + 1;
          responseBuffer.writeBit(value, i2 % 8, 3 + parseInt(i2 / 8));
          if (cbCount === length && !callbackInvoked) {
            modbusSerialDebug({ action: "FC" + fc + " response", responseBuffer });
            callbackInvoked = true;
            callback(null, responseBuffer);
          }
        };
      };
      if (length === 0)
        callback({
          modbusErrorCode: 2,
          // Illegal address
          msg: "Invalid length"
        });
      let i;
      let cb;
      let promiseOrValue;
      if (isGetCoil && vector.getCoil.length === 3) {
        for (i = 0; i < length; i++) {
          cb = buildCb(i);
          try {
            vector.getCoil(address + i, unitID, cb);
          } catch (err) {
            cb(err);
          }
        }
      } else if (isGetDiscreteInput && vector.getDiscreteInput.length === 3) {
        for (i = 0; i < length; i++) {
          cb = buildCb(i);
          try {
            vector.getDiscreteInput(address + i, unitID, cb);
          } catch (err) {
            cb(err);
          }
        }
      } else if (isGetCoil) {
        for (i = 0; i < length; i++) {
          cb = buildCb(i);
          try {
            promiseOrValue = vector.getCoil(address + i, unitID);
            _handlePromiseOrValue(promiseOrValue, cb);
          } catch (err) {
            cb(err);
          }
        }
      } else if (isGetDiscreteInput) {
        for (i = 0; i < length; i++) {
          cb = buildCb(i);
          try {
            promiseOrValue = vector.getDiscreteInput(address + i, unitID);
            _handlePromiseOrValue(promiseOrValue, cb);
          } catch (err) {
            cb(err);
          }
        }
      }
    }
  }
  function _handleReadMultipleRegisters(requestBuffer, vector, unitID, callback) {
    const valueSize = 2;
    const address = requestBuffer.readUInt16BE(2);
    const length = requestBuffer.readUInt16BE(4);
    if (_errorRequestBufferLength(requestBuffer)) {
      return;
    }
    const responseBuffer = Buffer.alloc(3 + length * valueSize + 2);
    try {
      responseBuffer.writeUInt8(length * valueSize, 2);
    } catch (err) {
      callback(err);
      return;
    }
    let callbackInvoked = false;
    let cbCount = 0;
    const buildCb = function(i2) {
      return function(err, value) {
        if (err) {
          if (!callbackInvoked) {
            callbackInvoked = true;
            callback(err);
          }
          return;
        }
        cbCount = cbCount + 1;
        responseBuffer.writeUInt16BE(value, 3 + i2 * valueSize);
        if (cbCount === length && !callbackInvoked) {
          modbusSerialDebug({ action: "FC3 response", responseBuffer });
          callbackInvoked = true;
          callback(null, responseBuffer);
        }
      };
    };
    if (length === 0)
      callback({
        modbusErrorCode: 2,
        // Illegal address
        msg: "Invalid length"
      });
    function tryAndHandlePromiseOrValue(i2, values) {
      const cb = buildCb(i2);
      try {
        const promiseOrValue = values[i2];
        _handlePromiseOrValue(promiseOrValue, cb);
      } catch (err) {
        cb(err);
      }
    }
    if (vector.getMultipleHoldingRegisters && length > 1) {
      if (vector.getMultipleHoldingRegisters.length === 4) {
        vector.getMultipleHoldingRegisters(address, length, unitID, function(err, values) {
          if (!err && values.length !== length) {
            const error = new Error("Requested address length and response length do not match");
            callback(error);
          } else if (err) {
            const cb = buildCb(i2);
            try {
              cb(err);
            } catch (ex) {
              cb(ex);
            }
          } else {
            for (var i2 = 0; i2 < length; i2++) {
              const cb = buildCb(i2);
              try {
                cb(err, values[i2]);
              } catch (ex) {
                cb(ex);
              }
            }
          }
        });
      } else {
        let values;
        try {
          values = vector.getMultipleHoldingRegisters(address, length, unitID);
        } catch (error) {
          callback(error);
          return;
        }
        if (values.length === length) {
          for (i = 0; i < length; i++) {
            tryAndHandlePromiseOrValue(i, values);
          }
        } else {
          const error = new Error("Requested address length and response length do not match");
          callback(error);
        }
      }
    } else if (vector.getHoldingRegister) {
      for (var i = 0; i < length; i++) {
        const cb = buildCb(i);
        try {
          if (vector.getHoldingRegister.length === 3) {
            vector.getHoldingRegister(address + i, unitID, cb);
          } else {
            const promiseOrValue = vector.getHoldingRegister(address + i, unitID);
            _handlePromiseOrValue(promiseOrValue, cb);
          }
        } catch (err) {
          cb(err);
        }
      }
    }
  }
  function _handleReadMultipleRegistersEnron(requestBuffer, vector, unitID, enronTables, callback) {
    const valueSize = 4;
    const address = requestBuffer.readUInt16BE(2);
    const length = requestBuffer.readUInt16BE(4);
    if (address >= enronTables.shortRange[0] && address <= enronTables.shortRange[1]) {
      return _handleReadMultipleRegisters(requestBuffer, vector, unitID, callback);
    }
    if (_errorRequestBufferLength(requestBuffer)) {
      return;
    }
    const responseBuffer = Buffer.alloc(3 + length * valueSize + 2);
    try {
      responseBuffer.writeUInt8(length * valueSize, 2);
    } catch (err) {
      callback(err);
      return;
    }
    let callbackInvoked = false;
    let cbCount = 0;
    const buildCb = function(i2) {
      return function(err, value) {
        if (err) {
          if (!callbackInvoked) {
            callbackInvoked = true;
            callback(err);
          }
          return;
        }
        cbCount = cbCount + 1;
        responseBuffer.writeUInt32BE(value, 3 + i2 * valueSize);
        if (cbCount === length && !callbackInvoked) {
          modbusSerialDebug({ action: "FC3 response", responseBuffer });
          callbackInvoked = true;
          callback(null, responseBuffer);
        }
      };
    };
    if (length === 0)
      callback({
        modbusErrorCode: 2,
        // Illegal address
        msg: "Invalid length"
      });
    function tryAndHandlePromiseOrValue(i2, values) {
      const cb = buildCb(i2);
      try {
        const promiseOrValue = values[i2];
        _handlePromiseOrValue(promiseOrValue, cb);
      } catch (err) {
        cb(err);
      }
    }
    if (vector.getMultipleHoldingRegisters && length > 1) {
      if (vector.getMultipleHoldingRegisters.length === 4) {
        vector.getMultipleHoldingRegisters(address, length, unitID, function(err, values) {
          if (!err && values.length !== length) {
            const error = new Error("Requested address length and response length do not match");
            callback(error);
          } else if (err) {
            const cb = buildCb(i2);
            try {
              cb(err);
            } catch (ex) {
              cb(ex);
            }
          } else {
            for (var i2 = 0; i2 < length; i2++) {
              const cb = buildCb(i2);
              try {
                cb(err, values[i2]);
              } catch (ex) {
                cb(ex);
              }
            }
          }
        });
      } else {
        let values;
        try {
          values = vector.getMultipleHoldingRegisters(address, length, unitID);
        } catch (error) {
          callback(error);
          return;
        }
        if (values.length === length) {
          for (i = 0; i < length; i++) {
            tryAndHandlePromiseOrValue(i, values);
          }
        } else {
          const error = new Error("Requested address length and response length do not match");
          callback(error);
        }
      }
    } else if (vector.getHoldingRegister) {
      for (var i = 0; i < length; i++) {
        const cb = buildCb(i);
        try {
          if (vector.getHoldingRegister.length === 3) {
            vector.getHoldingRegister(address + i, unitID, cb);
          } else {
            const promiseOrValue = vector.getHoldingRegister(address + i, unitID);
            _handlePromiseOrValue(promiseOrValue, cb);
          }
        } catch (err) {
          cb(err);
        }
      }
    }
  }
  function _handleReadInputRegisters(requestBuffer, vector, unitID, callback) {
    const address = requestBuffer.readUInt16BE(2);
    const length = requestBuffer.readUInt16BE(4);
    if (_errorRequestBufferLength(requestBuffer)) {
      return;
    }
    const responseBuffer = Buffer.alloc(3 + length * 2 + 2);
    try {
      responseBuffer.writeUInt8(length * 2, 2);
    } catch (err) {
      callback(err);
      return;
    }
    let callbackInvoked = false;
    let cbCount = 0;
    const buildCb = function(i2) {
      return function(err, value) {
        if (err) {
          if (!callbackInvoked) {
            callbackInvoked = true;
            callback(err);
          }
          return;
        }
        cbCount = cbCount + 1;
        responseBuffer.writeUInt16BE(value, 3 + i2 * 2);
        if (cbCount === length && !callbackInvoked) {
          modbusSerialDebug({ action: "FC4 response", responseBuffer });
          callbackInvoked = true;
          callback(null, responseBuffer);
        }
      };
    };
    if (length === 0)
      callback({
        modbusErrorCode: 2,
        // Illegal address
        msg: "Invalid length"
      });
    function tryAndHandlePromiseOrValues(i2, values) {
      const cb = buildCb(i2);
      try {
        const promiseOrValue = values[i2];
        _handlePromiseOrValue(promiseOrValue, cb);
      } catch (err) {
        cb(err);
      }
    }
    if (vector.getMultipleInputRegisters && length > 1) {
      if (vector.getMultipleInputRegisters.length === 4) {
        vector.getMultipleInputRegisters(address, length, unitID, function(err, values) {
          if (!err && values.length !== length) {
            const error = new Error("Requested address length and response length do not match");
            callback(error);
          } else {
            for (let i2 = 0; i2 < length; i2++) {
              const cb = buildCb(i2);
              try {
                cb(err, values[i2]);
              } catch (ex) {
                cb(ex);
              }
            }
          }
        });
      } else {
        let values;
        try {
          values = vector.getMultipleInputRegisters(address, length, unitID);
        } catch (error) {
          callback(error);
          return;
        }
        if (values.length === length) {
          for (var i = 0; i < length; i++) {
            tryAndHandlePromiseOrValues(i, values);
          }
        } else {
          const error = new Error("Requested address length and response length do not match");
          callback(error);
        }
      }
    } else if (vector.getInputRegister) {
      for (i = 0; i < length; i++) {
        const cb = buildCb(i);
        try {
          if (vector.getInputRegister.length === 3) {
            vector.getInputRegister(address + i, unitID, cb);
          } else {
            const promiseOrValue = vector.getInputRegister(address + i, unitID);
            _handlePromiseOrValue(promiseOrValue, cb);
          }
        } catch (ex) {
          cb(ex);
        }
      }
    }
  }
  function _handleWriteCoil(requestBuffer, vector, unitID, callback) {
    const address = requestBuffer.readUInt16BE(2);
    const state = requestBuffer.readUInt16BE(4);
    if (_errorRequestBufferLength(requestBuffer)) {
      return;
    }
    const responseBuffer = Buffer.alloc(8);
    responseBuffer.writeUInt16BE(address, 2);
    responseBuffer.writeUInt16BE(state, 4);
    if (vector.setCoil) {
      let callbackInvoked = false;
      const cb = function(err) {
        if (err) {
          if (!callbackInvoked) {
            callbackInvoked = true;
            callback(err);
          }
          return;
        }
        if (!callbackInvoked) {
          modbusSerialDebug({ action: "FC5 response", responseBuffer });
          callbackInvoked = true;
          callback(null, responseBuffer);
        }
      };
      try {
        if (vector.setCoil.length === 4) {
          vector.setCoil(address, state === 65280, unitID, cb);
        } else {
          const promiseOrValue = vector.setCoil(address, state === 65280, unitID);
          _handlePromiseOrValue(promiseOrValue, cb);
        }
      } catch (err) {
        cb(err);
      }
    }
  }
  function _handleWriteSingleRegister(requestBuffer, vector, unitID, callback) {
    const address = requestBuffer.readUInt16BE(2);
    const value = requestBuffer.readUInt16BE(4);
    if (_errorRequestBufferLength(requestBuffer)) {
      return;
    }
    const responseBuffer = Buffer.alloc(8);
    responseBuffer.writeUInt16BE(address, 2);
    responseBuffer.writeUInt16BE(value, 4);
    if (vector.setRegister) {
      let callbackInvoked = false;
      const cb = function(err) {
        if (err) {
          if (!callbackInvoked) {
            callbackInvoked = true;
            callback(err);
          }
          return;
        }
        if (!callbackInvoked) {
          modbusSerialDebug({ action: "FC6 response", responseBuffer });
          callbackInvoked = true;
          callback(null, responseBuffer);
        }
      };
      try {
        if (vector.setRegister.length === 4) {
          vector.setRegister(address, value, unitID, cb);
        } else {
          const promiseOrValue = vector.setRegister(address, value, unitID);
          _handlePromiseOrValue(promiseOrValue, cb);
        }
      } catch (err) {
        cb(err);
      }
    }
  }
  function _handleWriteSingleRegisterEnron(requestBuffer, vector, unitID, enronTables, callback) {
    const address = requestBuffer.readUInt16BE(2);
    const value = requestBuffer.readUInt32BE(4);
    if (address >= enronTables.shortRange[0] && address <= enronTables.shortRange[1]) {
      return _handleWriteSingleRegister(requestBuffer, vector, unitID, callback);
    }
    if (_errorRequestBufferLengthEnron(requestBuffer)) {
      return;
    }
    const responseBuffer = Buffer.alloc(10);
    responseBuffer.writeUInt16BE(address, 2);
    responseBuffer.writeUInt32BE(value, 4);
    if (vector.setRegister) {
      let callbackInvoked = false;
      const cb = function(err) {
        if (err) {
          if (!callbackInvoked) {
            callbackInvoked = true;
            callback(err);
          }
          return;
        }
        if (!callbackInvoked) {
          modbusSerialDebug({ action: "FC6 response", responseBuffer });
          callbackInvoked = true;
          callback(null, responseBuffer);
        }
      };
      try {
        if (vector.setRegister.length === 4) {
          vector.setRegister(address, value, unitID, cb);
        } else {
          const promiseOrValue = vector.setRegister(address, value, unitID);
          _handlePromiseOrValue(promiseOrValue, cb);
        }
      } catch (err) {
        cb(err);
      }
    }
  }
  function _handleForceMultipleCoils(requestBuffer, vector, unitID, callback) {
    const address = requestBuffer.readUInt16BE(2);
    const length = requestBuffer.readUInt16BE(4);
    if (requestBuffer.length !== 7 + Math.ceil(length / 8) + 2) {
      return;
    }
    const responseBuffer = Buffer.alloc(8);
    responseBuffer.writeUInt16BE(address, 2);
    responseBuffer.writeUInt16BE(length, 4);
    let callbackInvoked = false;
    let cbCount = 0;
    const buildCb = function() {
      return function(err) {
        if (err) {
          if (!callbackInvoked) {
            callbackInvoked = true;
            callback(err);
          }
          return;
        }
        cbCount = cbCount + 1;
        if (cbCount === length && !callbackInvoked) {
          modbusSerialDebug({ action: "FC15 response", responseBuffer });
          callbackInvoked = true;
          callback(null, responseBuffer);
        }
      };
    };
    if (length === 0)
      callback({
        modbusErrorCode: 2,
        // Illegal address
        msg: "Invalid length"
      });
    if (vector.setCoilArray) {
      const state = [];
      for (i = 0; i < length; i++) {
        cb = buildCb();
        state.push(requestBuffer.readBit(i, 7));
        _handlePromiseOrValue(promiseOrValue, cb);
      }
      try {
        if (vector.setCoilArray.length === 4) {
          vector.setCoilArray(address, state, unitID, cb);
        } else {
          vector.setCoilArray(address, state, unitID);
        }
      } catch (err) {
        cb(err);
      }
    } else if (vector.setCoil) {
      let state;
      for (var i = 0; i < length; i++) {
        var cb = buildCb();
        state = requestBuffer.readBit(i, 7);
        try {
          if (vector.setCoil.length === 4) {
            vector.setCoil(address + i, state !== false, unitID, cb);
          } else {
            var promiseOrValue = vector.setCoil(address + i, state !== false, unitID);
            _handlePromiseOrValue(promiseOrValue, cb);
          }
        } catch (err) {
          cb(err);
        }
      }
    }
  }
  function _handleWriteMultipleRegisters(requestBuffer, vector, unitID, callback) {
    const address = requestBuffer.readUInt16BE(2);
    const length = requestBuffer.readUInt16BE(4);
    if (requestBuffer.length !== 7 + length * 2 + 2) {
      return;
    }
    const responseBuffer = Buffer.alloc(8);
    responseBuffer.writeUInt16BE(address, 2);
    responseBuffer.writeUInt16BE(length, 4);
    let callbackInvoked = false;
    const cb = function(err) {
      if (err) {
        if (!callbackInvoked) {
          callbackInvoked = true;
          callback(err);
        }
        return;
      }
      if (!callbackInvoked) {
        modbusSerialDebug({ action: "FC16 response", responseBuffer });
        callbackInvoked = true;
        callback(null, responseBuffer);
      }
    };
    if (length === 0)
      callback({
        modbusErrorCode: 2,
        // Illegal address
        msg: "Invalid length"
      });
    if (vector.setRegisterArray) {
      value = [];
      try {
        for (i = 0; i < length; i++) {
          value.push(requestBuffer.readUInt16BE(7 + i * 2));
        }
        if (vector.setRegisterArray.length === 4) {
          vector.setRegisterArray(address, value, unitID, cb);
        } else {
          var promiseOrValue = vector.setRegisterArray(address, value, unitID);
          _handlePromiseOrValue(promiseOrValue, cb);
        }
      } catch (err) {
        cb(err);
      }
    } else if (vector.setRegister) {
      var value;
      for (var i = 0; i < length; i++) {
        try {
          value = requestBuffer.readUInt16BE(7 + i * 2);
          if (vector.setRegister.length === 4) {
            vector.setRegister(address + i, value, unitID, cb);
          } else {
            const promiseOrValue2 = vector.setRegister(address + i, value, unitID);
            _handlePromiseOrValue(promiseOrValue2, cb);
          }
        } catch (err) {
          cb(err);
        }
      }
    }
  }
  function _handleReportServerID(requestBuffer, vector, unitID, callback) {
    if (!vector.reportServerID) {
      callback({ modbusErrorCode: 1 });
      return;
    }
    const promiseOrValue = vector.reportServerID(unitID);
    _handlePromiseOrValue(promiseOrValue, function(err, value) {
      if (err) {
        callback(err);
        return;
      }
      if (!value) {
        callback({ modbusErrorCode: 1, msg: "Report Server ID not supported by device" });
        return;
      }
      if (!value.id || !value.running) {
        callback({ modbusErrorCode: 4, msg: "Invalid content provided for Report Server ID: " + JSON.stringify(value) });
        return;
      }
      const id = value.id;
      const running = value.running;
      const additionalData = value.additionalData;
      let contentLength = 2;
      if (additionalData) {
        contentLength += additionalData.length;
      }
      const totalLength = 3 + contentLength + 2;
      let i = 2;
      const responseBuffer = Buffer.alloc(totalLength);
      i = responseBuffer.writeUInt8(contentLength, i);
      i = responseBuffer.writeUInt8(id, i);
      if (running === true) {
        i = responseBuffer.writeUInt8(255, i);
      } else {
        i += 1;
      }
      if (additionalData) {
        additionalData.copy(responseBuffer, i);
      }
      callback(null, responseBuffer);
    });
  }
  function _handleMEI(requestBuffer, vector, unitID, callback) {
    const MEIType = requestBuffer[2];
    switch (parseInt(MEIType)) {
      case 14:
        _handleReadDeviceIdentification(requestBuffer, vector, unitID, callback);
        break;
      default:
        callback({ modbusErrorCode: 1 });
    }
  }
  function _handleReadDeviceIdentification(requestBuffer, vector, unitID, callback) {
    const PDULenMax = 253;
    const MEI14HeaderLen = 6;
    const stringLengthMax = PDULenMax - MEI14HeaderLen - 2;
    if (!vector.readDeviceIdentification) {
      callback({ modbusErrorCode: 1 });
      return;
    }
    const readDeviceIDCode = requestBuffer.readUInt8(3);
    let objectID = requestBuffer.readUInt8(4);
    switch (readDeviceIDCode) {
      case 1:
        if (objectID > 2 || objectID > 6 && objectID < 128)
          objectID = 0;
        break;
      case 2:
        if (objectID >= 128 || objectID > 6 && objectID < 128)
          objectID = 0;
        break;
      case 3:
        if (objectID > 6 && objectID < 128)
          objectID = 0;
        break;
      case 4:
        if (objectID > 6 && objectID < 128) {
          callback({ modbusErrorCode: 2 });
          return;
        }
        break;
      default:
        callback({ modbusErrorCode: 3 });
        return;
    }
    const objects = {
      0: "undefined",
      1: "undefined",
      2: "undefined"
    };
    const pkg = require$$1;
    if (pkg) {
      objects[0] = pkg.author;
      objects[1] = pkg.name;
      objects[2] = pkg.version;
    }
    const promiseOrValue = vector.readDeviceIdentification(unitID);
    _handlePromiseOrValue(promiseOrValue, function(err, value) {
      if (err) {
        callback(err);
        return;
      }
      const userObjects = value;
      for (const o of Object.keys(userObjects)) {
        const i2 = parseInt(o);
        if (!isNaN(i2) && i2 >= 0 && i2 <= 255)
          objects[i2] = userObjects[o];
      }
      if (!objects[objectID]) {
        if (readDeviceIDCode === 4) {
          callback({ modbusErrorCode: 2 });
          return;
        }
        objectID = 0;
      }
      const ids = [];
      let totalLength = 2 + MEI14HeaderLen + 2;
      let lastID = 0;
      let conformityLevel = 129;
      const supportedIDs = Object.keys(objects);
      for (var id of supportedIDs) {
        id = parseInt(id);
        if (isNaN(id))
          continue;
        if (id < 0 || id > 6 && id < 128 || id > 255) {
          callback({ modbusErrorCode: 4, msg: "Invalid Object ID provided for Read Device Identification: " + id });
        }
        if (id > 2)
          conformityLevel = 130;
        if (id > 128)
          conformityLevel = 131;
        if (objectID > id)
          continue;
        if (objects[id].length > stringLengthMax) {
          callback({
            modbusErrorCode: 4,
            msg: "Read Device Identification string size can be maximum " + stringLengthMax
          });
        }
        if (lastID !== 0)
          continue;
        if (objects[id].length + 2 > PDULenMax - totalLength) {
          if (lastID === 0)
            lastID = id;
        } else {
          totalLength += objects[id].length + 2;
          ids.push(id);
          if (readDeviceIDCode === 4)
            break;
        }
      }
      ids.sort((a, b) => parseInt(a) - parseInt(b));
      const responseBuffer = Buffer.alloc(totalLength);
      let i = 2;
      i = responseBuffer.writeUInt8(14, i);
      i = responseBuffer.writeUInt8(readDeviceIDCode, i);
      i = responseBuffer.writeUInt8(conformityLevel, i);
      if (lastID === 0)
        i = responseBuffer.writeUInt8(0, i);
      else
        i = responseBuffer.writeUInt8(255, i);
      i = responseBuffer.writeUInt8(lastID, i);
      i = responseBuffer.writeUInt8(ids.length, i);
      for (id of ids) {
        i = responseBuffer.writeUInt8(id, i);
        i = responseBuffer.writeUInt8(objects[id].length, i);
        i += responseBuffer.write(objects[id], i, objects[id].length);
      }
      callback(null, responseBuffer);
    });
  }
  servertcp_handler = {
    readCoilsOrInputDiscretes: _handleReadCoilsOrInputDiscretes,
    readMultipleRegisters: _handleReadMultipleRegisters,
    readMultipleRegistersEnron: _handleReadMultipleRegistersEnron,
    readInputRegisters: _handleReadInputRegisters,
    writeCoil: _handleWriteCoil,
    writeSingleRegister: _handleWriteSingleRegister,
    writeSingleRegisterEnron: _handleWriteSingleRegisterEnron,
    forceMultipleCoils: _handleForceMultipleCoils,
    writeMultipleRegisters: _handleWriteMultipleRegisters,
    reportServerID: _handleReportServerID,
    handleMEI: _handleMEI
  };
  return servertcp_handler;
}
var servertcp;
var hasRequiredServertcp;
function requireServertcp() {
  if (hasRequiredServertcp) return servertcp;
  hasRequiredServertcp = 1;
  const events = require$$0$3;
  const EventEmitter = events.EventEmitter || events;
  const net2 = require$$1$1;
  const modbusSerialDebug = srcExports("modbus-serial");
  const HOST = "127.0.0.1";
  const UNIT_ID = 255;
  const MODBUS_PORT = 502;
  const MBAP_LEN = 6;
  const handlers = requireServertcp_handler();
  buffer_bit();
  const crc16$1 = crc16;
  function _serverDebug(text, unitID, functionCode, responseBuffer) {
    if (typeof responseBuffer === "undefined") {
      modbusSerialDebug({
        error: text,
        unitID,
        functionCode
      });
    } else {
      modbusSerialDebug({
        action: text,
        unitID,
        functionCode,
        responseBuffer: responseBuffer.toString("hex")
      });
    }
  }
  function _callbackFactory(unitID, functionCode, sockWriter) {
    return function cb(err, responseBuffer) {
      if (err) {
        let errorCode = 4;
        if (!isNaN(err.modbusErrorCode)) {
          errorCode = err.modbusErrorCode;
        }
        functionCode = parseInt(functionCode) | 128;
        responseBuffer = Buffer.alloc(3 + 2);
        responseBuffer.writeUInt8(errorCode, 2);
        _serverDebug("error processing response", unitID, functionCode);
      }
      if (!responseBuffer) {
        _serverDebug("no response buffer", unitID, functionCode);
        return sockWriter(null, responseBuffer);
      }
      responseBuffer.writeUInt8(unitID, 0);
      responseBuffer.writeUInt8(functionCode, 1);
      const crc = crc16$1(responseBuffer.slice(0, -2));
      responseBuffer.writeUInt16LE(crc, responseBuffer.length - 2);
      _serverDebug("server response", unitID, functionCode, responseBuffer);
      return sockWriter(null, responseBuffer);
    };
  }
  function _parseModbusBuffer(requestBuffer, vector, serverUnitID, sockWriter, options) {
    if (!requestBuffer || requestBuffer.length < MBAP_LEN) {
      modbusSerialDebug("wrong size of request Buffer " + requestBuffer.length);
      return;
    }
    const unitID = requestBuffer[0];
    let functionCode = requestBuffer[1];
    const crc = requestBuffer[requestBuffer.length - 2] + requestBuffer[requestBuffer.length - 1] * 256;
    if (crc !== crc16$1(requestBuffer.slice(0, -2))) {
      modbusSerialDebug("wrong CRC of request Buffer");
      return;
    }
    if (serverUnitID !== 255 && serverUnitID !== unitID) {
      modbusSerialDebug("wrong unitID");
      return;
    }
    modbusSerialDebug("request for function code " + functionCode);
    const cb = _callbackFactory(unitID, functionCode, sockWriter);
    switch (parseInt(functionCode)) {
      case 1:
      case 2:
        handlers.readCoilsOrInputDiscretes(requestBuffer, vector, unitID, cb, functionCode);
        break;
      case 3:
        if (options.enron) {
          handlers.readMultipleRegistersEnron(requestBuffer, vector, unitID, options.enronTables, cb);
        } else {
          handlers.readMultipleRegisters(requestBuffer, vector, unitID, cb);
        }
        break;
      case 4:
        handlers.readInputRegisters(requestBuffer, vector, unitID, cb);
        break;
      case 5:
        handlers.writeCoil(requestBuffer, vector, unitID, cb);
        break;
      case 6:
        if (options.enron) {
          handlers.writeSingleRegisterEnron(requestBuffer, vector, unitID, options.enronTables, cb);
        } else {
          handlers.writeSingleRegister(requestBuffer, vector, unitID, cb);
        }
        break;
      case 15:
        handlers.forceMultipleCoils(requestBuffer, vector, unitID, cb);
        break;
      case 16:
        handlers.writeMultipleRegisters(requestBuffer, vector, unitID, cb);
        break;
      case 43:
        handlers.handleMEI(requestBuffer, vector, unitID, cb);
        break;
      default: {
        const errorCode = 1;
        functionCode = parseInt(functionCode) | 128;
        const responseBuffer = Buffer.alloc(3 + 2);
        responseBuffer.writeUInt8(errorCode, 2);
        modbusSerialDebug({
          error: "Illegal function",
          functionCode
        });
        cb({ modbusErrorCode: errorCode }, responseBuffer);
      }
    }
  }
  class ServerTCP extends EventEmitter {
    /**
     * Class making ModbusTCP server.
     *
     * @param vector - vector of server functions (see examples/server.js)
     * @param options - server options (host (IP), port, debug (true/false), unitID, enron? (true/false), enronTables? (object))
     * @constructor
     */
    constructor(vector, options) {
      super();
      const modbus = this;
      options = options || {};
      modbus._server = net2.createServer();
      modbus._server.on("error", function(error) {
        modbus.emit("serverError", error);
      });
      modbus._server.listen({
        port: options.port || MODBUS_PORT,
        host: options.host || HOST
      }, function() {
        modbus.emit("initialized");
      });
      const serverUnitID = options.unitID || UNIT_ID;
      modbus.socks = /* @__PURE__ */ new Map();
      modbus._server.on("connection", function(sock) {
        let recvBuffer = Buffer.from([]);
        modbus.socks.set(sock, 0);
        modbusSerialDebug({
          action: "connected",
          address: sock.address(),
          remoteAddress: sock.remoteAddress,
          localPort: sock.localPort
        });
        sock.once("close", function() {
          modbusSerialDebug({
            action: "closed"
          });
          modbus.socks.delete(sock);
        });
        sock.on("data", function(data) {
          modbusSerialDebug({ action: "socket data", data });
          recvBuffer = Buffer.concat([recvBuffer, data], recvBuffer.length + data.length);
          while (recvBuffer.length > MBAP_LEN) {
            const transactionsId = recvBuffer.readUInt16BE(0);
            const pduLen = recvBuffer.readUInt16BE(4);
            if (recvBuffer.length - MBAP_LEN < pduLen)
              break;
            const requestBuffer = Buffer.alloc(pduLen + 2);
            recvBuffer.copy(requestBuffer, 0, MBAP_LEN, MBAP_LEN + pduLen);
            recvBuffer = recvBuffer.slice(MBAP_LEN + pduLen);
            const crc = crc16$1(requestBuffer.slice(0, -2));
            requestBuffer.writeUInt16LE(crc, requestBuffer.length - 2);
            modbusSerialDebug({ action: "receive", data: requestBuffer, requestBufferLength: requestBuffer.length });
            modbusSerialDebug(JSON.stringify({ action: "receive", data: requestBuffer }));
            const sockWriter = function(err, responseBuffer) {
              if (err) {
                modbus.emit("error", err);
                return;
              }
              if (responseBuffer) {
                const outTcp = Buffer.alloc(responseBuffer.length + 6 - 2);
                outTcp.writeUInt16BE(transactionsId, 0);
                outTcp.writeUInt16BE(0, 2);
                outTcp.writeUInt16BE(responseBuffer.length - 2, 4);
                responseBuffer.copy(outTcp, 6);
                modbusSerialDebug({ action: "send", data: responseBuffer });
                modbusSerialDebug(JSON.stringify({ action: "send string", data: responseBuffer }));
                sock.write(outTcp);
              }
            };
            setTimeout(
              _parseModbusBuffer.bind(
                this,
                requestBuffer,
                vector,
                serverUnitID,
                sockWriter,
                options
              ),
              0
            );
          }
        });
        sock.on("error", function(err) {
          modbusSerialDebug(JSON.stringify({ action: "socket error", data: err }));
          modbus.emit("socketError", err);
        });
      });
    }
    /**
    * Delegate the close server method to backend.
    *
    * @param callback
    */
    close(callback) {
      const modbus = this;
      if (modbus._server) {
        modbus._server.removeAllListeners("data");
        modbus._server.close(callback);
        modbus.socks.forEach(function(e, sock) {
          sock.destroy();
        });
        modbusSerialDebug({ action: "close server" });
      } else {
        modbusSerialDebug({ action: "close server", warning: "server already closed" });
      }
    }
  }
  servertcp = ServerTCP;
  return servertcp;
}
var serverserial_pipe_handler;
var hasRequiredServerserial_pipe_handler;
function requireServerserial_pipe_handler() {
  if (hasRequiredServerserial_pipe_handler) return serverserial_pipe_handler;
  hasRequiredServerserial_pipe_handler = 1;
  const stream = require$$0$2;
  class ServerSerialPipeHandler extends stream.Transform {
    constructor({ maxBufferSize = 65536, interval, transformOptions }) {
      super(transformOptions);
      if (!interval) {
        throw new TypeError('"interval" is required');
      }
      if (typeof interval !== "number" || Number.isNaN(interval)) {
        throw new TypeError('"interval" is not a number');
      }
      if (interval < 1) {
        throw new TypeError('"interval" is not greater than 0');
      }
      if (typeof maxBufferSize !== "number" || Number.isNaN(maxBufferSize)) {
        throw new TypeError('"maxBufferSize" is not a number');
      }
      if (maxBufferSize < 1) {
        throw new TypeError('"maxBufferSize" is not greater than 0');
      }
      this.maxBufferSize = maxBufferSize;
      this.currentPacket = Buffer.from([]);
      this.interval = interval;
    }
    _transform(chunk, encoding, cb) {
      if (this.intervalID) {
        clearTimeout(this.intervalID);
      }
      let offset = 0;
      while (this.currentPacket.length + chunk.length >= this.maxBufferSize) {
        this.currentPacket = Buffer.concat([this.currentPacket, chunk.slice(offset, this.maxBufferSize - this.currentPacket.length)]);
        offset = offset + this.maxBufferSize;
        chunk = chunk.slice(offset);
        this.emitPacket();
      }
      this.currentPacket = Buffer.concat([this.currentPacket, chunk]);
      this.intervalID = setTimeout(this.emitPacket.bind(this), this.interval);
      cb();
    }
    emitPacket() {
      if (this.intervalID) {
        clearTimeout(this.intervalID);
      }
      if (this.currentPacket.length > 0) {
        this.push(this.currentPacket);
      }
      this.currentPacket = Buffer.from([]);
    }
    _flush(cb) {
      this.emitPacket();
      cb();
    }
  }
  serverserial_pipe_handler = ServerSerialPipeHandler;
  return serverserial_pipe_handler;
}
var serverserial;
var hasRequiredServerserial;
function requireServerserial() {
  if (hasRequiredServerserial) return serverserial;
  hasRequiredServerserial = 1;
  const events = require$$0$3;
  const EventEmitter = events.EventEmitter || events;
  const modbusSerialDebug = srcExports("modbus-serial");
  const { SerialPort } = requireDist();
  const ServerSerialPipeHandler = requireServerserial_pipe_handler();
  const PORT = "/dev/tty";
  const BAUDRATE = 9600;
  const PARITY = "none";
  const UNIT_ID = 255;
  const ADDR_LEN = 1;
  const MIN_LEN = 6;
  const handlers = requireServertcp_handler();
  buffer_bit();
  const crc16$1 = crc16;
  function _serverDebug(text, unitID, functionCode, responseBuffer) {
    if (typeof responseBuffer === "undefined") {
      modbusSerialDebug({
        error: text,
        unitID,
        functionCode
      });
    } else {
      modbusSerialDebug({
        action: text,
        unitID,
        functionCode,
        responseBuffer: responseBuffer.toString("hex")
      });
    }
  }
  function _callbackFactory(unitID, functionCode, sockWriter) {
    return function cb(err, responseBuffer) {
      if (err) {
        let errorCode = 4;
        if (!isNaN(err.modbusErrorCode)) {
          errorCode = err.modbusErrorCode;
        }
        functionCode = parseInt(functionCode) | 128;
        responseBuffer = Buffer.alloc(3 + 2);
        responseBuffer.writeUInt8(errorCode, 2);
        _serverDebug("error processing response", unitID, functionCode);
      }
      if (!responseBuffer) {
        _serverDebug("no response buffer", unitID, functionCode);
        return sockWriter(null, responseBuffer);
      }
      responseBuffer.writeUInt8(unitID, 0);
      responseBuffer.writeUInt8(functionCode, 1);
      const crc = crc16$1(responseBuffer.slice(0, -2));
      responseBuffer.writeUInt16LE(crc, responseBuffer.length - 2);
      _serverDebug("server response", unitID, functionCode, responseBuffer);
      return sockWriter(null, responseBuffer);
    };
  }
  function _parseModbusBuffer(requestBuffer, vector, serverUnitID, sockWriter, options) {
    if (!requestBuffer || requestBuffer.length < MIN_LEN) {
      modbusSerialDebug("wrong size of request Buffer " + requestBuffer.length);
      return;
    }
    const unitID = requestBuffer[0];
    let functionCode = requestBuffer[1];
    const crc = requestBuffer[requestBuffer.length - 2] + requestBuffer[requestBuffer.length - 1] * 256;
    if (crc !== crc16$1(requestBuffer.slice(0, -2))) {
      modbusSerialDebug("wrong CRC of request Buffer");
      return;
    }
    if (serverUnitID !== 255 && serverUnitID !== unitID) {
      modbusSerialDebug("wrong unitID");
      return;
    }
    modbusSerialDebug("request for function code " + functionCode);
    const cb = _callbackFactory(unitID, functionCode, sockWriter);
    switch (parseInt(functionCode)) {
      case 1:
      case 2:
        handlers.readCoilsOrInputDiscretes(requestBuffer, vector, unitID, cb, functionCode);
        break;
      case 3:
        if (options && options.enron) {
          handlers.readMultipleRegistersEnron(requestBuffer, vector, unitID, options.enronTables, cb);
        } else {
          handlers.readMultipleRegisters(requestBuffer, vector, unitID, cb);
        }
        break;
      case 4:
        handlers.readInputRegisters(requestBuffer, vector, unitID, cb);
        break;
      case 5:
        handlers.writeCoil(requestBuffer, vector, unitID, cb);
        break;
      case 6:
        if (options && options.enron) {
          handlers.writeSingleRegisterEnron(requestBuffer, vector, unitID, options.enronTables, cb);
        } else {
          handlers.writeSingleRegister(requestBuffer, vector, unitID, cb);
        }
        break;
      case 15:
        handlers.forceMultipleCoils(requestBuffer, vector, unitID, cb);
        break;
      case 16:
        handlers.writeMultipleRegisters(requestBuffer, vector, unitID, cb);
        break;
      case 17:
        handlers.reportServerID(requestBuffer, vector, unitID, cb);
        break;
      case 43:
        handlers.handleMEI(requestBuffer, vector, unitID, cb);
        break;
      default: {
        const errorCode = 1;
        functionCode = parseInt(functionCode) | 128;
        const responseBuffer = Buffer.alloc(3 + 2);
        responseBuffer.writeUInt8(errorCode, 2);
        modbusSerialDebug({
          error: "Illegal function",
          functionCode
        });
        cb({ modbusErrorCode: errorCode }, responseBuffer);
      }
    }
  }
  class ServerSerial extends EventEmitter {
    /**
     * Class making ModbusRTU server.
     *
     * @param vector - vector of server functions (see examples/server.js)
     * @param options - server options (host (IP), port, debug (true/false), unitID, enron? (true/false), enronTables? (object))
     * @param serialportOptions - additional parameters for serialport options
     * @constructor
     */
    constructor(vector, options, serialportOptions) {
      super();
      const modbus = this;
      options = options || {};
      const optionsWithBinding = {
        path: options.path || options.port || PORT,
        baudRate: options.baudRate || options.baudrate || BAUDRATE,
        parity: options.parity || PARITY,
        debug: options.debug || false,
        unitID: options.unitID || 255
      };
      const optionsWithSerialPortTimeoutParser = {
        maxBufferSize: options.maxBufferSize || 65536,
        interval: options.interval || 30
      };
      if (options.binding) optionsWithBinding.binding = options.binding;
      const optionsWithBindingandSerialport = Object.assign({}, serialportOptions, optionsWithBinding);
      modbus._serverPath = new SerialPort(optionsWithBindingandSerialport, options.openCallback);
      modbus._server = modbus._serverPath.pipe(new ServerSerialPipeHandler(optionsWithSerialPortTimeoutParser));
      modbus._server.on("error", function(err) {
        console.log("Error: ", err.message);
      });
      const serverUnitID = options.unitID || UNIT_ID;
      modbus.socks = /* @__PURE__ */ new Map();
      modbus._serverPath.on("open", function() {
        modbus.socks.set(modbus._server, 0);
        modbusSerialDebug({
          action: "connected"
          // address: sock.address(),
          // remoteAddress: sock.remoteAddress,
          // localPort: sock.localPort
        });
        modbus._server.on("close", function() {
          modbusSerialDebug({
            action: "closed"
          });
          modbus.socks.delete(modbus._server);
        });
        modbus.emit("initialized");
      });
      modbus._server.on("data", function(data) {
        let recvBuffer = Buffer.from([]);
        modbusSerialDebug({ action: "socket data", data });
        recvBuffer = Buffer.concat([recvBuffer, data], recvBuffer.length + data.length);
        while (recvBuffer.length > ADDR_LEN) {
          const requestBuffer = Buffer.alloc(recvBuffer.length);
          recvBuffer.copy(requestBuffer, 0, 0, recvBuffer.length);
          recvBuffer = recvBuffer.slice(recvBuffer.length);
          const crc = crc16$1(requestBuffer.slice(0, -2));
          requestBuffer.writeUInt16LE(crc, requestBuffer.length - 2);
          modbusSerialDebug({ action: "receive", data: requestBuffer, requestBufferLength: requestBuffer.length });
          modbusSerialDebug(JSON.stringify({ action: "receive", data: requestBuffer }));
          const sockWriter = function(err, responseBuffer) {
            if (err) {
              console.error(err, responseBuffer);
              modbus.emit("error", err);
              return;
            }
            if (responseBuffer) {
              modbusSerialDebug({ action: "send", data: responseBuffer });
              modbusSerialDebug(JSON.stringify({ action: "send string", data: responseBuffer }));
              (options.portResponse || modbus._serverPath).write(responseBuffer);
            }
          };
          setTimeout(
            _parseModbusBuffer.bind(
              this,
              requestBuffer,
              vector,
              serverUnitID,
              sockWriter,
              options
            ),
            0
          );
        }
      });
      modbus._server.on("error", function(err) {
        modbusSerialDebug(JSON.stringify({ action: "socket error", data: err }));
        modbus.emit("socketError", err);
      });
    }
    getPort() {
      return this._serverPath;
    }
    /**
    * Delegate the close server method to backend.
    *
    * @param callback
    */
    close(callback) {
      const modbus = this;
      if (modbus._server) {
        modbus._server.removeAllListeners("data");
        modbus._serverPath.close(callback);
        modbus.socks.forEach(function(e, sock) {
          sock.destroy();
        });
        modbusSerialDebug({ action: "close server" });
      } else {
        modbusSerialDebug({ action: "close server", warning: "server already closed" });
      }
    }
  }
  serverserial = ServerSerial;
  return serverserial;
}
(function(module) {
  buffer_bit();
  const crc16$1 = crc16;
  const modbusSerialDebug = srcExports("modbus-serial");
  const events = require$$0$3;
  const EventEmitter = events.EventEmitter || events;
  const PORT_NOT_OPEN_MESSAGE = "Port Not Open";
  const PORT_NOT_OPEN_ERRNO = "ECONNREFUSED";
  const BAD_ADDRESS_MESSAGE = "Bad Client Address";
  const BAD_ADDRESS_ERRNO = "ECONNREFUSED";
  const TRANSACTION_TIMED_OUT_MESSAGE = "Timed out";
  const TRANSACTION_TIMED_OUT_ERRNO = "ETIMEDOUT";
  const modbusErrorMessages = [
    "Unknown error",
    "Illegal function (device does not support this read/write function)",
    "Illegal data address (register not supported by device)",
    "Illegal data value (value cannot be written to this register)",
    "Slave device failure (device reports internal error)",
    "Acknowledge (requested data will be available later)",
    "Slave device busy (retry request again later)",
    "Negative acknowledge (slave device cannot perform programming functions)",
    "Memory parity error (slave device detected a parity error in memory)",
    "Unknown error",
    "Gateway path unavailable (misconfigured gateway)",
    "Gateway target device failed to respond (retry request again later)"
  ];
  const PortNotOpenError = function() {
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.message = PORT_NOT_OPEN_MESSAGE;
    this.errno = PORT_NOT_OPEN_ERRNO;
  };
  const BadAddressError = function() {
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.message = BAD_ADDRESS_MESSAGE;
    this.errno = BAD_ADDRESS_ERRNO;
  };
  const TransactionTimedOutError = function() {
    this.name = this.constructor.name;
    this.message = TRANSACTION_TIMED_OUT_MESSAGE;
    this.errno = TRANSACTION_TIMED_OUT_ERRNO;
  };
  const SerialPortError = function() {
    this.name = this.constructor.name;
    this.message = null;
    this.errno = "ECONNREFUSED";
  };
  function _readFC2(data, next) {
    const length = data.readUInt8(2);
    const contents = [];
    for (let i = 0; i < length; i++) {
      let reg = data[i + 3];
      for (let j = 0; j < 8; j++) {
        contents.push((reg & 1) === 1);
        reg = reg >> 1;
      }
    }
    if (next)
      next(null, { "data": contents, "buffer": data.slice(3, 3 + length) });
  }
  function _readFC3or4(data, next) {
    const length = data.readUInt8(2);
    const contents = [];
    for (let i = 0; i < length; i += 2) {
      const reg = data.readUInt16BE(i + 3);
      contents.push(reg);
    }
    if (next)
      next(null, { "data": contents, "buffer": data.slice(3, 3 + length) });
  }
  function _readFC3or4Enron(data, next) {
    const length = data.readUInt8(2);
    const contents = [];
    for (let i = 0; i < length; i += 4) {
      const reg = data.readUInt32BE(i + 3);
      contents.push(reg);
    }
    if (next)
      next(null, { "data": contents, "buffer": data.slice(3, 3 + length) });
  }
  function _readFC5(data, next) {
    const dataAddress = data.readUInt16BE(2);
    const state = data.readUInt16BE(4);
    if (next)
      next(null, { "address": dataAddress, "state": state === 65280 });
  }
  function _readFC6(data, next) {
    const dataAddress = data.readUInt16BE(2);
    const value = data.readUInt16BE(4);
    if (next)
      next(null, { "address": dataAddress, "value": value });
  }
  function _readFC6Enron(data, next) {
    const dataAddress = data.readUInt16BE(2);
    const value = data.readUInt32BE(4);
    if (next)
      next(null, { "address": dataAddress, "value": value });
  }
  function _readFC16(data, next) {
    const dataAddress = data.readUInt16BE(2);
    const length = data.readUInt16BE(4);
    if (next)
      next(null, { "address": dataAddress, "length": length });
  }
  function _readFC17(data, next) {
    const length = parseInt(data.readUInt8(2), 10);
    const serverId = parseInt(data.readUInt8(3), 10);
    const running = data.readUInt8(4) === 255;
    let additionalData;
    if (length > 2) {
      additionalData = Buffer.alloc(length - 2);
      data.copy(additionalData, 0, 5, data.length - 2);
    } else {
      additionalData = Buffer.alloc(0);
    }
    if (next)
      next(null, { serverId, running, additionalData });
  }
  function _readFC20(data, next) {
    const fileRespLength = parseInt(data.readUInt8(2), 10);
    const result = [];
    for (let i = 5; i < fileRespLength + 5; i++) {
      const reg = data.readUInt8(i);
      result.push(reg);
    }
    if (next)
      next(null, { "data": result, "length": fileRespLength });
  }
  function _readFC22(data, next) {
    const dataAddress = data.readUInt16BE(2);
    const andMask = data.readUInt16BE(4);
    const orMask = data.readUInt16BE(6);
    if (next)
      next(null, { "address": dataAddress, "andMask": andMask, "orMask": orMask });
  }
  function _readFC23(data, next) {
    const bytes = data.readUInt8(2);
    const values = [];
    for (let i = 0; i < bytes; i += 2) {
      const reg = data.readUInt16BE(3 + i);
      values.push(reg);
    }
    if (next) next(null, { data: values });
  }
  function _readFC43(data, modbus, next) {
    const address = parseInt(data.readUInt8(0), 10);
    const readDeviceIdCode = parseInt(data.readUInt8(3), 10);
    const conformityLevel = parseInt(data.readUInt8(4), 10);
    const moreFollows = parseInt(data.readUInt8(5), 10);
    const nextObjectId = parseInt(data.readUInt8(6), 10);
    const numOfObjects = parseInt(data.readUInt8(7), 10);
    let startAt = 8;
    const result = {};
    for (let i = 0; i < numOfObjects && startAt < data.length; i++) {
      const objectId = parseInt(data.readUInt8(startAt), 10);
      const objectLength = parseInt(data.readUInt8(startAt + 1), 10);
      const startOfData = startAt + 2;
      result[objectId] = data.toString("ascii", startOfData, startOfData + objectLength);
      startAt = startOfData + objectLength;
    }
    if (moreFollows && numOfObjects) {
      const cb = function(err, data2) {
        data2.data = Object.assign(data2.data, result);
        return next(err, data2);
      };
      modbus.writeFC43(address, readDeviceIdCode, nextObjectId, cb);
    } else if (next) {
      next(null, { data: result, conformityLevel });
    }
  }
  function _readCustomFC(data, _modbus, next) {
    const length = data.length - 4;
    const contents = [];
    for (let i = 0; i < length; i++) {
      const byte = data.readUInt8(i + 2);
      contents.push(byte);
    }
    if (next)
      next(null, { "data": contents, "buffer": data.slice(2, 2 + length) });
  }
  function _writeBufferToPort(buffer, transactionId) {
    const transaction = this._transactions[transactionId];
    if (transaction) {
      transaction._timeoutFired = false;
      transaction._timeoutHandle = _startTimeout(this._timeout, transaction);
      if (this._debugEnabled) {
        transaction.request = Uint8Array.prototype.slice.call(buffer);
        transaction.responses = [];
      }
    }
    this._port.write(buffer);
  }
  function _startTimeout(duration, transaction) {
    if (!duration) {
      return void 0;
    }
    return setTimeout(function() {
      transaction._timeoutFired = true;
      if (transaction.next) {
        const err = new TransactionTimedOutError();
        if (transaction.request && transaction.responses) {
          err.modbusRequest = transaction.request;
          err.modbusResponses = transaction.responses;
        }
        transaction.next(err);
      }
    }, duration);
  }
  function _cancelTimeout(timeoutHandle) {
    clearTimeout(timeoutHandle);
  }
  function _onReceive(data) {
    const modbus = this;
    let error;
    const transaction = modbus._transactions[modbus._port._transactionIdRead];
    if (!transaction) {
      return;
    }
    if (transaction.responses) {
      transaction.responses.push(Uint8Array.prototype.slice.call(data));
    }
    const next = function(err, res) {
      if (transaction.next) {
        if (transaction.request && transaction.responses) {
          if (err) {
            err.modbusRequest = transaction.request;
            err.modbusResponses = transaction.responses;
          }
          if (res) {
            res.request = transaction.request;
            res.responses = transaction.responses;
          }
        }
        return transaction.next(err, res);
      }
    };
    _cancelTimeout(transaction._timeoutHandle);
    transaction._timeoutHandle = void 0;
    if (transaction._timeoutFired === true) {
      return;
    }
    if (!transaction.lengthUnknown && data.length < 5) {
      error = "Data length error, expected " + transaction.nextLength + " got " + data.length;
      next(new Error(error));
      return;
    }
    const crcIn = data.readUInt16LE(data.length - 2);
    if (crcIn !== crc16$1(data.slice(0, -2))) {
      error = "CRC error";
      next(new Error(error));
      return;
    }
    const address = data.readUInt8(0);
    const code = data.readUInt8(1);
    if (data.length >= 5 && code === (128 | transaction.nextCode)) {
      const errorCode = data.readUInt8(2);
      if (transaction.next) {
        error = new Error("Modbus exception " + errorCode + ": " + (modbusErrorMessages[errorCode] || "Unknown error"));
        error.modbusCode = errorCode;
        next(error);
      }
      return;
    }
    if (modbus._enron) {
      const example = {
        enronTables: {
          booleanRange: [1001, 1999],
          shortRange: [3001, 3999],
          longRange: [5001, 5999],
          floatRange: [7001, 7999]
        }
      };
      if (typeof modbus._enronTables === "undefined" || modbus._enronTables.shortRange.length !== 2 || modbus._enronTables.shortRange[0] >= modbus._enronTables.shortRange[1]) {
        next(new Error("Enron table definition missing from options. Example: " + JSON.stringify(example)));
        return;
      }
    }
    if (!transaction.lengthUnknown && data.length !== transaction.nextLength) {
      error = "Data length error, expected " + transaction.nextLength + " got " + data.length;
      next(new Error(error));
      return;
    }
    if (Number(address) !== Number(transaction.nextAddress)) {
      error = "Unexpected data error, expected address " + transaction.nextAddress + " got " + address;
      if (transaction.next)
        next(new Error(error));
      return;
    }
    if (code !== transaction.nextCode) {
      error = "Unexpected data error, expected code " + transaction.nextCode + " got " + code;
      if (transaction.next)
        next(new Error(error));
      return;
    }
    try {
      switch (code) {
        case 1:
        case 2:
          _readFC2(data, next);
          break;
        case 3:
        case 4:
          if (modbus._enron && !(transaction.nextDataAddress >= modbus._enronTables.shortRange[0] && transaction.nextDataAddress <= modbus._enronTables.shortRange[1])) {
            _readFC3or4Enron(data, next);
          } else {
            _readFC3or4(data, next);
          }
          break;
        case 5:
          _readFC5(data, next);
          break;
        case 6:
          if (modbus._enron && !(transaction.nextDataAddress >= modbus._enronTables.shortRange[0] && transaction.nextDataAddress <= modbus._enronTables.shortRange[1])) {
            _readFC6Enron(data, next);
          } else {
            _readFC6(data, next);
          }
          break;
        case 15:
        case 16:
          _readFC16(data, next);
          break;
        case 17:
          _readFC17(data, next);
          break;
        case 20:
          _readFC20(data, transaction.next);
          break;
        case 22:
          _readFC22(data, next);
          break;
        case 23:
          _readFC23(data, next);
          break;
        case 43:
          _readFC43(data, modbus, next);
      }
      if (code >= 65 && code <= 72 || code >= 100 && code <= 110) {
        _readCustomFC(data, transaction.nextCode, next);
      }
    } catch (e) {
      if (transaction.next) {
        next(e);
      }
    }
  }
  function _onError(e) {
    const err = new SerialPortError();
    err.message = e.message;
    err.stack = e.stack;
    this.emit("error", err);
  }
  class ModbusRTU extends EventEmitter {
    /**
     * Class making ModbusRTU calls fun and easy.
     *
     * @param {SerialPort} port the serial port to use.
     */
    constructor(port) {
      super();
      this._port = port;
      this._transactions = {};
      this._timeout = null;
      this._unitID = 1;
      this._debugEnabled = false;
      this._onReceive = _onReceive.bind(this);
      this._onError = _onError.bind(this);
      this._onPortClose = (function() {
        this.emit("close");
      }).bind(this);
    }
    /**
     * Open the serial port and register Modbus parsers
     *
     * @param {Function} callback the function to call next on open success
     *      of failure.
     */
    open(callback) {
      const modbus = this;
      modbus._port.open(function(error) {
        if (error) {
          modbusSerialDebug({ action: "port open error", error });
          if (callback)
            callback(error);
        } else {
          modbus._port._transactionIdRead = 1;
          modbus._port._transactionIdWrite = 1;
          modbus._port.removeListener("data", modbus._onReceive);
          modbus._port.on("data", modbus._onReceive);
          modbus._port.removeListener("error", modbus._onError);
          modbus._port.on("error", modbus._onError);
          modbus._port.removeListener("close", modbus._onPortClose);
          modbus._port.once("close", modbus._onPortClose);
          if (callback)
            callback(error);
        }
      });
    }
    get isDebugEnabled() {
      return this._debugEnabled;
    }
    set isDebugEnabled(enable) {
      enable = Boolean(enable);
      this._debugEnabled = enable;
    }
    get isOpen() {
      if (this._port) {
        return this._port.isOpen;
      }
      return false;
    }
    /**
     * Clears the timeout for all pending transactions.
     * This essentially cancels all pending requests.
     */
    _cancelPendingTransactions() {
      if (Object.keys(this._transactions).length > 0) {
        Object.values(this._transactions).forEach((transaction) => {
          if (transaction._timeoutHandle) {
            _cancelTimeout(transaction._timeoutHandle);
          }
        });
      }
    }
    /**
     * Close the serial port
     *
     * @param {Function} callback the function to call next on close success
     *      or failure.
     */
    close(callback) {
      if (this._port) {
        this._port.removeListener("data", this._onReceive);
        this._port.removeListener("error", this._onError);
        this._port.removeListener("close", this._onPortClose);
        this._port.close(callback);
      } else {
        callback();
      }
    }
    /**
     * Destroy the serial port
     *
     * @param {Function} callback the function to call next on close success
     *      or failure.
     */
    destroy(callback) {
      this._cancelPendingTransactions();
      if (this._port && this._port.destroy) {
        this._port.removeListener("data", this._onReceive);
        this._port.removeListener("error", this._onError);
        this._port.removeListener("close", this._onPortClose);
        this._port.destroy();
        callback();
      } else {
        callback();
      }
    }
    /**
     * Write a Modbus "Read Coil Status" (FC=01) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the first coil.
     * @param {number} length the total number of coils requested.
     * @param {Function} next the function to call next.
     */
    writeFC1(address, dataAddress, length, next) {
      this.writeFC2(address, dataAddress, length, next, 1);
    }
    /**
     * Write a Modbus "Read Input Status" (FC=02) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the first digital input.
     * @param {number} length the total number of digital inputs requested.
     * @param {Function} next the function to call next.
     */
    writeFC2(address, dataAddress, length, next, code) {
      if (this.isOpen !== true) {
        if (next) next(new PortNotOpenError());
        return;
      }
      if (typeof address === "undefined" || typeof dataAddress === "undefined") {
        if (next) next(new BadAddressError());
        return;
      }
      code = code || 2;
      this._transactions[this._port._transactionIdWrite] = {
        nextAddress: address,
        nextCode: code,
        nextLength: 3 + parseInt((length - 1) / 8 + 1, 10) + 2,
        next
      };
      const codeLength = 6;
      const buf = Buffer.alloc(codeLength + 2);
      buf.writeUInt8(address, 0);
      buf.writeUInt8(code, 1);
      buf.writeUInt16BE(dataAddress, 2);
      buf.writeUInt16BE(length, 4);
      buf.writeUInt16LE(crc16$1(buf.subarray(0, -2)), codeLength);
      _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
    /**
     * Write a Modbus "Read Holding Registers" (FC=03) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the first register.
     * @param {number} length the total number of registers requested.
     * @param {Function} next the function to call next.
     */
    writeFC3(address, dataAddress, length, next) {
      this.writeFC4(address, dataAddress, length, next, 3);
    }
    /**
     * Write a Modbus "Read Input Registers" (FC=04) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the first register.
     * @param {number} length the total number of registers requested.
     * @param {Function} next the function to call next.
     */
    writeFC4(address, dataAddress, length, next, code) {
      if (this.isOpen !== true) {
        if (next) next(new PortNotOpenError());
        return;
      }
      if (typeof address === "undefined" || typeof dataAddress === "undefined") {
        if (next) next(new BadAddressError());
        return;
      }
      code = code || 4;
      let valueSize = 2;
      if (this._enron && !(dataAddress >= this._enronTables.shortRange[0] && dataAddress <= this._enronTables.shortRange[1])) {
        valueSize = 4;
      }
      this._transactions[this._port._transactionIdWrite] = {
        nextAddress: address,
        nextDataAddress: dataAddress,
        nextCode: code,
        nextLength: 3 + valueSize * length + 2,
        next
      };
      const codeLength = 6;
      const buf = Buffer.alloc(codeLength + 2);
      buf.writeUInt8(address, 0);
      buf.writeUInt8(code, 1);
      buf.writeUInt16BE(dataAddress, 2);
      buf.writeUInt16BE(length, 4);
      buf.writeUInt16LE(crc16$1(buf.subarray(0, -2)), codeLength);
      _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
    /**
     * Write a Modbus "Force Single Coil" (FC=05) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the coil.
     * @param {number} state the boolean state to write to the coil (true / false).
     * @param {Function} next the function to call next.
     */
    writeFC5(address, dataAddress, state, next) {
      if (this.isOpen !== true) {
        if (next) next(new PortNotOpenError());
        return;
      }
      if (typeof address === "undefined" || typeof dataAddress === "undefined") {
        if (next) next(new BadAddressError());
        return;
      }
      const code = 5;
      this._transactions[this._port._transactionIdWrite] = {
        nextAddress: address,
        nextCode: code,
        nextLength: 8,
        next
      };
      const codeLength = 6;
      const buf = Buffer.alloc(codeLength + 2);
      buf.writeUInt8(address, 0);
      buf.writeUInt8(code, 1);
      buf.writeUInt16BE(dataAddress, 2);
      if (state) {
        buf.writeUInt16BE(65280, 4);
      } else {
        buf.writeUInt16BE(0, 4);
      }
      buf.writeUInt16LE(crc16$1(buf.subarray(0, -2)), codeLength);
      _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
    /**
     * Write a Modbus "Preset Single Register " (FC=6) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the register.
     * @param {number} value the value to write to the register.
     * @param {Function} next the function to call next.
     */
    writeFC6(address, dataAddress, value, next) {
      if (this.isOpen !== true) {
        if (next) next(new PortNotOpenError());
        return;
      }
      if (typeof address === "undefined" || typeof dataAddress === "undefined") {
        if (next) next(new BadAddressError());
        return;
      }
      const code = 6;
      let valueSize = 8;
      if (this._enron && !(dataAddress >= this._enronTables.shortRange[0] && dataAddress <= this._enronTables.shortRange[1])) {
        valueSize = 10;
      }
      this._transactions[this._port._transactionIdWrite] = {
        nextAddress: address,
        nextDataAddress: dataAddress,
        nextCode: code,
        nextLength: valueSize,
        next
      };
      let codeLength = 6;
      if (this._enron && !(dataAddress >= this._enronTables.shortRange[0] && dataAddress <= this._enronTables.shortRange[1])) {
        codeLength = 8;
      }
      const buf = Buffer.alloc(codeLength + 2);
      buf.writeUInt8(address, 0);
      buf.writeUInt8(code, 1);
      buf.writeUInt16BE(dataAddress, 2);
      if (Buffer.isBuffer(value)) {
        value.copy(buf, 4);
      } else if (this._enron && !(dataAddress >= this._enronTables.shortRange[0] && dataAddress <= this._enronTables.shortRange[1])) {
        buf.writeUInt32BE(value, 4);
      } else {
        buf.writeUInt16BE(value, 4);
      }
      buf.writeUInt16LE(crc16$1(buf.subarray(0, -2)), codeLength);
      _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
    /**
     * Write a Modbus "Force Multiple Coils" (FC=15) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the first coil.
     * @param {Array} array the array of boolean states to write to coils.
     * @param {Function} next the function to call next.
     */
    writeFC15(address, dataAddress, array, next) {
      if (this.isOpen !== true) {
        if (next) next(new PortNotOpenError());
        return;
      }
      if (typeof address === "undefined" || typeof dataAddress === "undefined") {
        if (next) next(new BadAddressError());
        return;
      }
      const code = 15;
      let i;
      this._transactions[this._port._transactionIdWrite] = {
        nextAddress: address,
        nextCode: code,
        nextLength: 8,
        next
      };
      const dataBytes = Math.ceil(array.length / 8);
      const codeLength = 7 + dataBytes;
      const buf = Buffer.alloc(codeLength + 2);
      buf.writeUInt8(address, 0);
      buf.writeUInt8(code, 1);
      buf.writeUInt16BE(dataAddress, 2);
      buf.writeUInt16BE(array.length, 4);
      buf.writeUInt8(dataBytes, 6);
      for (i = 0; i < dataBytes; i++) {
        buf.writeUInt8(0, 7 + i);
      }
      for (i = 0; i < array.length; i++) {
        if (array[i]) {
          buf.writeBit(1, i, 7);
        }
      }
      buf.writeUInt16LE(crc16$1(buf.subarray(0, -2)), codeLength);
      _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
    /**
     * Write a Modbus "Preset Multiple Registers" (FC=16) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the first register.
     * @param {Array} array the array of values to write to registers.
     * @param {Function} next the function to call next.
     */
    writeFC16(address, dataAddress, array, next) {
      if (this.isOpen !== true) {
        if (next) next(new PortNotOpenError());
        return;
      }
      if (typeof address === "undefined" || typeof dataAddress === "undefined") {
        if (next) next(new BadAddressError());
        return;
      }
      const code = 16;
      this._transactions[this._port._transactionIdWrite] = {
        nextAddress: address,
        nextCode: code,
        nextLength: 8,
        next
      };
      let dataLength = array.length;
      if (Buffer.isBuffer(array)) {
        dataLength = array.length / 2;
      }
      const codeLength = 7 + 2 * dataLength;
      const buf = Buffer.alloc(codeLength + 2);
      buf.writeUInt8(address, 0);
      buf.writeUInt8(code, 1);
      buf.writeUInt16BE(dataAddress, 2);
      buf.writeUInt16BE(dataLength, 4);
      buf.writeUInt8(dataLength * 2, 6);
      if (Buffer.isBuffer(array)) {
        array.copy(buf, 7);
      } else {
        for (let i = 0; i < dataLength; i++) {
          buf.writeUInt16BE(array[i], 7 + 2 * i);
        }
      }
      buf.writeUInt16LE(crc16$1(buf.subarray(0, -2)), codeLength);
      _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
    /**
     * Write a Modbus "Report Server ID" (FC=17) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {Function} next the function to call next.
     */
    writeFC17(address, da, l, next) {
      if (this.isOpen !== true) {
        if (next) next(new PortNotOpenError());
        return;
      }
      const code = 17;
      this._transactions[this._port._transactionIdWrite] = {
        nextAddress: address,
        nextCode: code,
        lengthUnknown: true,
        next
      };
      const codeLength = 2;
      const buf = Buffer.alloc(codeLength + 2);
      buf.writeUInt8(address, 0);
      buf.writeUInt8(code, 1);
      buf.writeUInt16LE(crc16$1(buf.subarray(0, -2)), codeLength);
      _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
    /**
     * Write a Modbus "Read Device Identification" (FC=20) to serial port
     * @param {number} address the slave unit address.
     * @param {Function} next;
     */
    writeFC20(address, fileNumber, recordNumber, next) {
      if (this.isOpen !== true) {
        if (next) next(new PortNotOpenError());
        return;
      }
      if (typeof address === "undefined") {
        if (next) next(new BadAddressError());
        return;
      }
      const code = 20;
      const codeLength = 10;
      const byteCount = 7;
      const chunk = 100;
      this._transactions[this._port._transactionIdWrite] = {
        nextAddress: address,
        nextCode: code,
        lengthUnknown: true,
        next
      };
      const buf = Buffer.alloc(codeLength + 2);
      buf.writeUInt8(address, 0);
      buf.writeUInt8(code, 1);
      buf.writeUInt8(byteCount, 2);
      buf.writeUInt8(6, 3);
      buf.writeUInt16BE(fileNumber, 4);
      buf.writeUInt16BE(recordNumber, 6);
      buf.writeUInt8(chunk, 9);
      buf.writeUInt16LE(crc16$1(buf.subarray(0, -2)), codeLength);
      _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
    /**
     * Write a Modbus "Mask Write Register" (FC=22) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the register.
     * @param {number} andMask the AND mask value.
     * @param {number} orMask the OR mask value.
     * @param {Function} next the function to call next.
     */
    writeFC22(address, dataAddress, andMask, orMask, next) {
      if (this.isOpen !== true) {
        if (next) next(new PortNotOpenError());
        return;
      }
      if (typeof address === "undefined" || typeof dataAddress === "undefined") {
        if (next) next(new BadAddressError());
        return;
      }
      const code = 22;
      const codeLength = 8;
      this._transactions[this._port._transactionIdWrite] = {
        nextAddress: address,
        nextCode: code,
        nextLength: codeLength + 2,
        next
      };
      const buf = Buffer.alloc(codeLength + 2);
      buf.writeUInt8(address, 0);
      buf.writeUInt8(code, 1);
      buf.writeUInt16BE(dataAddress, 2);
      buf.writeUInt16BE(andMask, 4);
      buf.writeUInt16BE(orMask, 6);
      buf.writeUInt16LE(crc16$1(buf.slice(0, -2)), codeLength);
      _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
    /**
     * Write a Modbus "Read/Write Multiple Registers" (FC=23) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} startingReadAddress the Data Address of the first register to read.
     * @param {number} numReadRegisters the number of registers to read.
     * @param {number} startingWriteAddress the Data Address of the first register to write.
     * @param {number} numWriteRegisters the number of registers to write.
     * @param {Array|Buffer} valuesToWrite the array of values or buffer to write to registers.
     * @param {Function} next the function to call next.
     */
    writeFC23(address, startingReadAddress, numReadRegisters, startingWriteAddress, numWriteRegisters, valuesToWrite, next) {
      if (this.isOpen !== true) {
        if (next) next(new PortNotOpenError());
        return;
      }
      if (typeof address === "undefined" || typeof startingReadAddress === "undefined" || typeof startingWriteAddress === "undefined") {
        if (next) next(new BadAddressError());
        return;
      }
      if (!Array.isArray(valuesToWrite) && !Buffer.isBuffer(valuesToWrite)) {
        if (next)
          next(new Error("Parameter valuesToWrite must be an array or buffer"));
        return;
      }
      const maxReadRegistersFC23 = 125;
      const maxWriteRegistersFC23 = 123;
      function invalidFc23RegisterCount(n, max) {
        if (typeof n === "undefined") return true;
        if (typeof n !== "number" || Number.isNaN(n) || !isFinite(n)) return true;
        if (Math.floor(n) !== n) return true;
        return n < 1 || n > max;
      }
      if (invalidFc23RegisterCount(numReadRegisters, maxReadRegistersFC23)) {
        if (next) {
          next(new Error("numReadRegisters must be an integer from 1 to " + maxReadRegistersFC23));
        }
        return;
      }
      if (invalidFc23RegisterCount(numWriteRegisters, maxWriteRegistersFC23)) {
        if (next) {
          next(new Error("numWriteRegisters must be an integer from 1 to " + maxWriteRegistersFC23));
        }
        return;
      }
      const code = 23;
      const writeByteCount = numWriteRegisters * 2;
      if (Buffer.isBuffer(valuesToWrite)) {
        if (valuesToWrite.length < writeByteCount) {
          if (next) next(new Error("valuesToWrite length does not match numWriteRegisters"));
          return;
        }
      } else if (valuesToWrite.length < numWriteRegisters) {
        if (next) next(new Error("valuesToWrite length does not match numWriteRegisters"));
        return;
      }
      const responseLength = 3 + numReadRegisters * 2 + 2;
      this._transactions[this._port._transactionIdWrite] = {
        nextAddress: address,
        nextCode: code,
        nextLength: responseLength,
        next
      };
      const codeLength = 11 + writeByteCount;
      const buf = Buffer.alloc(codeLength + 2);
      buf.writeUInt8(address, 0);
      buf.writeUInt8(code, 1);
      buf.writeUInt16BE(startingReadAddress, 2);
      buf.writeUInt16BE(numReadRegisters, 4);
      buf.writeUInt16BE(startingWriteAddress, 6);
      buf.writeUInt16BE(numWriteRegisters, 8);
      buf.writeUInt8(writeByteCount, 10);
      if (Buffer.isBuffer(valuesToWrite)) {
        valuesToWrite.copy(buf, 11);
      } else {
        for (let i = 0; i < numWriteRegisters; i++) {
          buf.writeUInt16BE(valuesToWrite[i], 11 + 2 * i);
        }
      }
      buf.writeUInt16LE(crc16$1(buf.slice(0, -2)), codeLength);
      _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
    /**
     * Write a Modbus "Custom Function Code" (FC=65-72, 100-110) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} functionCode the custom function code.
     * @param {Array<number>} data the array of bytes to send.
     * @param {Function} next the function to call next.
     */
    writeCustomFC(address, functionCode, data, next) {
      if (this.isOpen !== true) {
        if (next) next(new PortNotOpenError());
        return;
      }
      if (typeof address === "undefined" || typeof functionCode === "undefined") {
        if (next) next(new BadAddressError());
        return;
      }
      const code = functionCode;
      const codeLength = 2 + data.length;
      this._transactions[this._port._transactionIdWrite] = {
        nextAddress: address,
        nextCode: code,
        lengthUnknown: true,
        next
      };
      const buf = Buffer.alloc(codeLength + 2);
      buf.writeUInt8(address, 0);
      buf.writeUInt8(code, 1);
      let pos = 2;
      for (const byte of data) {
        buf.writeUInt8(byte, pos);
        pos += 1;
      }
      buf.writeUInt16LE(crc16$1(buf.slice(0, -2)), codeLength);
      _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
    /**
     * Write a Modbus "Read Device Identification" (FC=43) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} deviceIdCode the read device access code.
     * @param {number} objectId the array of values to write to registers.
     * @param {Function} next the function to call next.
     */
    writeFC43(address, deviceIdCode, objectId, next) {
      if (this.isOpen !== true) {
        if (next) next(new PortNotOpenError());
        return;
      }
      const code = 43;
      this._transactions[this._port._transactionIdWrite] = {
        nextAddress: address,
        nextCode: code,
        lengthUnknown: true,
        next
      };
      const codeLength = 5;
      const buf = Buffer.alloc(codeLength + 2);
      buf.writeUInt8(address, 0);
      buf.writeUInt8(code, 1);
      buf.writeUInt8(14, 2);
      buf.writeUInt8(deviceIdCode, 3);
      buf.writeUInt8(objectId, 4);
      buf.writeUInt16LE(crc16$1(buf.subarray(0, -2)), codeLength);
      _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
  }
  requireConnection()(ModbusRTU);
  requirePromise()(ModbusRTU);
  requireWorker()(ModbusRTU);
  module.exports = ModbusRTU;
  module.exports.getPorts = function getPorts() {
    const { SerialPort } = requireDist();
    return SerialPort.list();
  };
  module.exports.TestPort = requireTestport();
  try {
    module.exports.RTUBufferedPort = requireRtubufferedport();
  } catch (err) {
  }
  module.exports.TcpPort = requireTcpport();
  module.exports.TcpRTUBufferedPort = requireTcprtubufferedport();
  module.exports.TelnetPort = requireTelnetport();
  module.exports.C701Port = requireC701port();
  module.exports.ServerTCP = requireServertcp();
  try {
    module.exports.ServerSerial = requireServerserial();
  } catch (err) {
  }
  module.exports.default = module.exports;
})(modbusSerial);
function useIpcOn(channel, callback) {
  ipcMain.on(channel, (_, ...args) => {
    callback(...args);
  });
}
function useIpcHandle(channel, callback) {
  ipcMain.handle(channel, (_, ...args) => {
    return callback(...args);
  });
}
function useIpcSend(win2, channel, ...args) {
  if (!win2 || win2.isDestroyed()) return;
  win2.webContents.send(channel, ...args);
}
let plcPollInterval = null;
function startPlcPolling(win2) {
  if (plcPollInterval) return;
  const plc = new PLCConnector();
  plc.defineItems({
    FWD: "DB4,X0.0",
    REV: "DB4,X0.1",
    STOP: "DB4,X0.2",
    HOME: "DB4,X0.3",
    MEASURE: "DB4,X0.4"
    // Rectfy: 'DB4,X0.5', // 校正
    // reversal: 'DB4,X0.6', // 反向
    // jogFwd: 'DB4,X0.7', // 正换向
    // jogRev: 'DB4,X1.0' // 反换向
  });
  plc.connectIfNeeded().then(() => {
    console.log("✅ PLC 连接成功，开始轮询");
    plcPollInterval = setInterval(async () => {
      try {
        const values = await plc.readAll();
        useIpcSend(win2, "plc-controlData", values);
      } catch (err) {
        console.error("PLC 读取失败:", err);
      }
    }, 1e3);
  }).catch((err) => {
    dialog.showErrorBox("PLC 初始化失败", "连接 PLC 失败，请联系管理员");
  });
}
function stopPlcPolling() {
  if (plcPollInterval) {
    clearInterval(plcPollInterval);
    plcPollInterval = null;
  }
}
function setupRendererCommunicator(win2) {
  useIpcOn("win-minimize", () => {
    win2.minimize();
  });
  useIpcOn("win-maximize", () => {
    const windowIsMax = win2.isMaximized();
    if (windowIsMax) {
      win2.restore();
    } else {
      win2.maximize();
    }
  });
  useIpcOn("win-close", () => {
    app.quit();
  });
  useIpcOn("win-toggle-fullscreen", () => {
    if (win2) {
      win2.setFullScreen(!win2.isFullScreen());
    }
  });
  useIpcHandle("win-get-logo", () => {
    if (win2) {
      try {
        const imageBuffer = fs.readFileSync("D:/logo/logo.png");
        if (!imageBuffer) return;
        const base64Image = Buffer.from(imageBuffer).toString("base64");
        const imgSrc = `data:image/png;base64,${base64Image}`;
        return imgSrc;
      } catch (error) {
      }
    }
  });
  useIpcHandle("win-open-client", () => {
    try {
      const result = ensureServerRunning("JinJiu.Scan.Client2", "D:/server/JinJiu.Scan.Client2.exe", dialog);
      return result;
    } catch (error) {
    }
  });
  useIpcOn("change-State", (message) => {
    try {
      const plc = new PLCConnector();
      plc.writeItems(message.address, message.value);
    } catch (error) {
      dialog.showErrorBox("PLC通信故障", "写入PLC数据失败");
    }
  });
  ipcMain.handle("plc-paramData", async (_, data) => {
    const plc = new PLCConnector();
    plc.defineItems(data);
    try {
      await plc.connectIfNeeded();
      const values = await plc.readAll();
      return values;
    } catch (err) {
      console.error("PLC 读取失败:", err);
      throw new Error("PLC 读取或连接失败");
    }
  });
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    autoHideMenuBar: true,
    width: 1280,
    height: 1024,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  if (win) {
    setupRendererCommunicator(win);
    startPlcPolling(win);
  }
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
const getLock = app.requestSingleInstanceLock();
if (!getLock) {
  app.quit();
} else {
  app.on("second-instance", (event) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}
app.on("ready", () => {
  ensureServerRunning("JinJiu.Scan.Server2", "D:/server/JinJiu.Scan.Server2.exe", dialog);
  app.setLoginItemSettings({
    openAtLogin: true
  });
});
app.on("will-finish-launching", () => {
  if (!fs.existsSync("D:/JJSK_Data")) {
    fs.mkdirSync("D:/JJSK_Data");
  }
  app.setPath("appData", "D:/JJSK_Data");
});
app.on("before-quit", () => {
  stopPlcPolling();
  win == null ? void 0 : win.removeAllListeners("close");
  globalShortcut.unregisterAll();
  win == null ? void 0 : win.close();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(createWindow);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
