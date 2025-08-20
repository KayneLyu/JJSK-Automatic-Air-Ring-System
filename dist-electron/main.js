var Z = Object.defineProperty;
var J = (e, t, r) => t in e ? Z(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r;
var v = (e, t, r) => J(e, typeof t != "symbol" ? t + "" : t, r);
import { ipcMain as R, app as k, dialog as I, globalShortcut as $, BrowserWindow as q } from "electron";
import { fileURLToPath as j } from "node:url";
import b from "node:path";
import x from "fs";
import ee from "net";
import te from "util";
function re(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
var ne = ee, O = te, M = 0, V = !1, ae = c;
function c(e) {
  e = e || {}, V = e.silent || !1, M = e.debug ? 99 : 0;
  var t = this;
  t.connectReq = Buffer.from([3, 0, 0, 22, 17, 224, 0, 0, 0, 2, 0, 192, 1, 10, 193, 2, 1, 0, 194, 2, 1, 2]), t.negotiatePDU = Buffer.from([3, 0, 0, 25, 2, 240, 128, 50, 1, 0, 0, 0, 0, 0, 8, 0, 0, 240, 0, 0, 8, 0, 8, 3, 192]), t.readReqHeader = Buffer.from([3, 0, 0, 31, 2, 240, 128, 50, 1, 0, 0, 8, 0, 0, 14, 0, 0, 4, 1]), t.readReq = Buffer.alloc(1500), t.writeReqHeader = Buffer.from([3, 0, 0, 31, 2, 240, 128, 50, 1, 0, 0, 8, 0, 0, 14, 0, 0, 5, 1]), t.writeReq = Buffer.alloc(1500), t.resetPending = !1, t.resetTimeout = void 0, t.isoclient = void 0, t.isoConnectionState = 0, t.requestMaxPDU = 960, t.maxPDU = 960, t.requestMaxParallel = 8, t.maxParallel = 8, t.parallelJobsNow = 0, t.maxGap = 5, t.doNotOptimize = !1, t.connectCallback = void 0, t.readDoneCallback = void 0, t.writeDoneCallback = void 0, t.connectTimeout = void 0, t.PDUTimeout = void 0, t.globalTimeout = 1500, t.rack = 0, t.slot = 2, t.localTSAP = null, t.remoteTSAP = null, t.readPacketArray = [], t.writePacketArray = [], t.polledReadBlockList = [], t.instantWriteBlockList = [], t.globalReadBlockList = [], t.globalWriteBlockList = [], t.masterSequenceNumber = 1, t.translationCB = N, t.connectionParams = void 0, t.connectionID = "UNDEF", t.addRemoveArray = [], t.readPacketValid = !1, t.writeInQueue = !1, t.connectCBIssued = !1, t.dropConnectionCallback = null, t.dropConnectionTimer = null, t.reconnectTimer = void 0, t.rereadTimer = void 0;
}
c.prototype.getNextSeqNum = function() {
  var e = this;
  return e.masterSequenceNumber += 1, e.masterSequenceNumber > 32767 && (e.masterSequenceNumber = 1), i("seqNum is " + e.masterSequenceNumber, 1, e.connectionID), e.masterSequenceNumber;
};
c.prototype.setTranslationCB = function(e) {
  var t = this;
  typeof e == "function" && (i("Translation OK"), t.translationCB = e);
};
c.prototype.initiateConnection = function(e, t) {
  var r = this;
  e === void 0 && (e = { port: 102, host: "192.168.8.106" }), i("Initiate Called - Connecting to PLC with address and parameters:"), i(e), typeof e.rack < "u" && (r.rack = e.rack), typeof e.slot < "u" && (r.slot = e.slot), typeof e.localTSAP < "u" && (r.localTSAP = e.localTSAP), typeof e.remoteTSAP < "u" && (r.remoteTSAP = e.remoteTSAP), typeof e.connection_name > "u" ? r.connectionID = e.host + " S" + r.slot : r.connectionID = e.connection_name, typeof e.doNotOptimize < "u" && (r.doNotOptimize = e.doNotOptimize), typeof e.timeout < "u" && (r.globalTimeout = e.timeout), r.connectionParams = e, r.connectCallback = t, r.connectCBIssued = !1, r.connectNow(r.connectionParams, !1);
};
c.prototype.dropConnection = function(e) {
  var t = this;
  clearTimeout(t.reconnectTimer), clearTimeout(t.rereadTimer), clearTimeout(t.connectTimeout), clearTimeout(t.PDUTimeout), t.reconnectTimer = void 0, t.rereadTimer = void 0, t.connectTimeout = void 0, t.PDUTimeout = void 0, typeof t.isoclient < "u" ? (t.dropConnectionCallback = e, t.isoclient.end(), t.dropConnectionTimer = setTimeout(function() {
    t.dropConnectionCallback && (t.connectionCleanup(), t.dropConnectionCallback(), t.dropConnectionCallback = null);
  }, 2500)) : e();
};
c.prototype.connectNow = function(e) {
  var t = this;
  clearTimeout(t.reconnectTimer), t.reconnectTimer = void 0, !(t.isoConnectionState >= 1) && (t.connectionCleanup(), t.isoclient = ne.connect(e), t.isoclient.setTimeout(e.timeout || 5e3, () => {
    t.isoclient.destroy(), t.connectError.apply(t, [{ code: "EUSERTIMEOUT" }]);
  }), t.isoclient.once("connect", () => {
    t.isoclient.setTimeout(0), t.onTCPConnect.apply(t, arguments);
  }), t.isoConnectionState = 1, t.isoclient.on("error", function() {
    t.connectError.apply(t, arguments);
  }), i("<initiating a new connection " + Date() + ">", 1, t.connectionID), i("Attempting to connect to host...", 0, t.connectionID));
};
c.prototype.connectError = function(e) {
  var t = this;
  i("We Caught a connect error " + e.code, 0, t.connectionID), !t.connectCBIssued && typeof t.connectCallback == "function" && (t.connectCBIssued = !0, t.connectCallback(e)), t.isoConnectionState = 0;
};
c.prototype.readWriteError = function(e) {
  var t = this;
  i("We Caught a read/write error " + e.code + " - will DISCONNECT and attempt to reconnect."), t.isoConnectionState = 0, t.connectionReset();
};
c.prototype.packetTimeout = function(e, t) {
  var r = this;
  if (i("PacketTimeout called with type " + e + " and seq " + t, 1, r.connectionID), e === "connect") {
    i("TIMED OUT connecting to the PLC - Disconnecting", 0, r.connectionID), i("Wait for 2 seconds then try again.", 0, r.connectionID), r.connectionReset(), i("Scheduling a reconnect from packetTimeout, connect type", 0, r.connectionID), clearTimeout(r.reconnectTimer), r.reconnectTimer = setTimeout(function() {
      i("The scheduled reconnect from packetTimeout, connect type, is happening now", 0, r.connectionID), r.isoConnectionState === 0 && r.connectNow.apply(r, arguments);
    }, 2e3, r.connectionParams);
    return;
  }
  if (e === "PDU") {
    i("TIMED OUT waiting for PDU reply packet from PLC - Disconnecting"), i("Wait for 2 seconds then try again.", 0, r.connectionID), r.connectionReset(), i("Scheduling a reconnect from packetTimeout, connect type", 0, r.connectionID), clearTimeout(r.reconnectTimer), r.reconnectTimer = setTimeout(function() {
      i("The scheduled reconnect from packetTimeout, PDU type, is happening now", 0, r.connectionID), r.connectNow.apply(r, arguments);
    }, 2e3, r.connectionParams);
    return;
  }
  if (e === "read") {
    i("READ TIMEOUT on sequence number " + t, 0, r.connectionID), r.isoConnectionState === 4 && (i("ConnectionReset from read packet timeout.", 0, r.connectionID), r.connectionReset()), r.readResponse(void 0, r.findReadIndexOfSeqNum(t));
    return;
  }
  if (e === "write") {
    i("WRITE TIMEOUT on sequence number " + t, 0, r.connectionID), r.isoConnectionState === 4 && (i("ConnectionReset from write packet timeout.", 0, r.connectionID), r.connectionReset()), r.writeResponse(void 0, r.findWriteIndexOfSeqNum(t));
    return;
  }
  i("Unknown timeout error.  Nothing was done - this shouldn't happen.");
};
c.prototype.onTCPConnect = function() {
  var e = this, t;
  i("TCP Connection Established to " + e.isoclient.remoteAddress + " on port " + e.isoclient.remotePort, 0, e.connectionID), i("Will attempt ISO-on-TCP connection", 0, e.connectionID), e.isoConnectionState = 2, e.connectTimeout = setTimeout(function() {
    e.packetTimeout.apply(e, arguments);
  }, e.globalTimeout, "connect"), t = e.connectReq.slice(), e.localTSAP !== null && e.remoteTSAP !== null ? (i("Using localTSAP [0x" + e.localTSAP.toString(16) + "] and remoteTSAP [0x" + e.remoteTSAP.toString(16) + "]", 0, e.connectionID), t.writeUInt16BE(e.localTSAP, 16), t.writeUInt16BE(e.remoteTSAP, 20)) : (i("Using rack [" + e.rack + "] and slot [" + e.slot + "]", 0, e.connectionID), t[21] = e.rack * 32 + e.slot), e.isoclient.write(t), e.isoclient.on("data", function() {
    e.onISOConnectReply.apply(e, arguments);
  }), e.isoclient.on("end", function() {
    e.onClientDisconnect.apply(e, arguments);
  }), e.isoclient.on("close", function() {
    e.onClientClose.apply(e, arguments);
  });
};
c.prototype.onISOConnectReply = function(e) {
  var t = this;
  if (t.isoclient.removeAllListeners("data"), clearTimeout(t.connectTimeout), t.isoConnectionState != 2) {
    i("Ignoring ISO connect reply, expecting isoConnectionState of 2, is currently " + t.isoConnectionState, 0, t.connectionID);
    return;
  }
  if (t.isoConnectionState = 3, e.readInt16BE(2) !== e.length || e.length < 22 || e[5] !== 208 || e[4] !== e.length - 5)
    return i("INVALID PACKET or CONNECTION REFUSED - DISCONNECTING"), i(e), i("TPKT Length From Header is " + e.readInt16BE(2) + " and RCV buffer length is " + e.length + " and COTP length is " + e.readUInt8(4) + " and data[5] is " + e[5]), t.connectionReset(), null;
  i("ISO-on-TCP Connection Confirm Packet Received", 0, t.connectionID), t.negotiatePDU.writeInt16BE(t.requestMaxParallel, 19), t.negotiatePDU.writeInt16BE(t.requestMaxParallel, 21), t.negotiatePDU.writeInt16BE(t.requestMaxPDU, 23), t.PDUTimeout = setTimeout(function() {
    t.packetTimeout.apply(t, arguments);
  }, t.globalTimeout, "PDU"), t.isoclient.write(t.negotiatePDU.slice(0, 25)), t.isoclient.on("data", function() {
    t.onPDUReply.apply(t, arguments);
  }), t.isoclient.removeAllListeners("error"), t.isoclient.on("error", function() {
    t.readWriteError.apply(t, arguments);
  });
};
c.prototype.onPDUReply = function(e) {
  var t = this;
  t.isoclient.removeAllListeners("data"), t.isoclient.removeAllListeners("error"), clearTimeout(t.PDUTimeout);
  var r = Q(e);
  if (r === "fastACK")
    i("Fast Acknowledge received.", 0, t.connectionID), t.isoclient.removeAllListeners("error"), t.isoclient.removeAllListeners("data"), t.isoclient.on("data", function() {
      t.onPDUReply.apply(t, arguments);
    }), t.isoclient.on("error", function() {
      t.readWriteError.apply(t, arguments);
    });
  else if (r[4] + 1 + 12 + r.readInt16BE(13) === r.readInt16BE(2) - 4) {
    t.isoConnectionState = 4, t.parallelJobsNow = 0;
    var n = r.readInt16BE(21), a = r.readInt16BE(23), o = r.readInt16BE(25);
    t.maxParallel = t.requestMaxParallel, n < t.requestMaxParallel && (t.maxParallel = n), a < t.requestMaxParallel && (t.maxParallel = a), o < t.requestMaxPDU ? t.maxPDU = o : t.maxPDU = t.requestMaxPDU, i("Received PDU Response - Proceeding with PDU " + t.maxPDU + " and " + t.maxParallel + " max parallel connections.", 0, t.connectionID), t.isoclient.on("data", function() {
      t.onResponse.apply(t, arguments);
    }), t.isoclient.on("error", function() {
      t.readWriteError.apply(t, arguments);
    }), !t.connectCBIssued && typeof t.connectCallback == "function" && (t.connectCBIssued = !0, t.connectCallback());
  } else
    return i("INVALID Telegram ", 0, t.connectionID), i("Byte 0 From Header is " + e[0] + " it has to be 0x03, Byte 5 From Header is  " + e[5] + " and it has to be 0x0F ", 0, t.connectionID), i("INVALID PDU RESPONSE or CONNECTION REFUSED - DISCONNECTING", 0, t.connectionID), i("TPKT Length From Header is " + e.readInt16BE(2) + " and RCV buffer length is " + e.length + " and COTP length is " + e.readUInt8(4) + " and data[6] is " + e[6], 0, t.connectionID), i(e), t.isoclient.end(), clearTimeout(t.reconnectTimer), t.reconnectTimer = setTimeout(function() {
      t.connectNow.apply(t, arguments);
    }, 2e3, t.connectionParams), null;
};
c.prototype.writeItems = function(e, t, r) {
  var n = this, a;
  if (i("Preparing to WRITE " + e + " to value " + t, 0, n.connectionID), n.isWriting() || n.writeInQueue)
    return i("You must wait until all previous writes have finished before scheduling another. ", 0, n.connectionID), 1;
  if (typeof r == "function" ? n.writeDoneCallback = r : n.writeDoneCallback = N, n.instantWriteBlockList = [], typeof e == "string")
    n.instantWriteBlockList.push(U(n.translationCB(e), e, n.connectionParams)), typeof n.instantWriteBlockList[n.instantWriteBlockList.length - 1] < "u" && (n.instantWriteBlockList[n.instantWriteBlockList.length - 1].writeValue = t);
  else if (Array.isArray(e) && Array.isArray(t) && e.length == t.length)
    for (a = 0; a < e.length; a++)
      typeof e[a] == "string" && (n.instantWriteBlockList.push(U(n.translationCB(e[a]), e[a], n.connectionParams)), typeof n.instantWriteBlockList[n.instantWriteBlockList.length - 1] < "u" && (n.instantWriteBlockList[n.instantWriteBlockList.length - 1].writeValue = t[a]));
  for (a = n.instantWriteBlockList.length - 1; a >= 0; a--)
    n.instantWriteBlockList[a] === void 0 && (n.instantWriteBlockList.splice(a, 1), i("Dropping an undefined write item."));
  return n.prepareWritePacket(), n.isReading() ? (n.writeInQueue && i("Write was already in queue - should be prevented above", 1, n.connectionID), n.writeInQueue = !0, i("Adding write to queue")) : n.sendWritePacket(), 0;
};
c.prototype.findItem = function(e) {
  var t = this, r, n = { value: t.isoConnectionState !== 4, quality: "OK" };
  if (e === "_COMMERR")
    return n;
  for (r = 0; r < t.polledReadBlockList.length; r++)
    if (t.polledReadBlockList[r].useraddr === e)
      return t.polledReadBlockList[r];
};
c.prototype.addItems = function(e) {
  var t = this;
  t.addRemoveArray.push({ arg: e, action: "add" });
};
c.prototype.addItemsNow = function(e) {
  var t = this, r;
  if (i("Adding " + e, 0, t.connectionID), typeof e == "string" && e !== "_COMMERR")
    t.polledReadBlockList.push(U(t.translationCB(e), e, t.connectionParams));
  else if (Array.isArray(e))
    for (r = 0; r < e.length; r++)
      typeof e[r] == "string" && e[r] !== "_COMMERR" && t.polledReadBlockList.push(U(t.translationCB(e[r]), e[r], t.connectionParams));
  for (r = t.polledReadBlockList.length - 1; r >= 0; r--)
    t.polledReadBlockList[r] === void 0 && (t.polledReadBlockList.splice(r, 1), i("Dropping an undefined request item.", 0, t.connectionID));
  t.readPacketValid = !1;
};
c.prototype.removeItems = function(e) {
  var t = this;
  t.addRemoveArray.push({ arg: e, action: "remove" });
};
c.prototype.removeItemsNow = function(e) {
  var t = this, r;
  if (typeof e > "u")
    t.polledReadBlockList = [];
  else if (typeof e == "string")
    for (r = 0; r < t.polledReadBlockList.length; r++)
      i("TCBA " + t.translationCB(e)), t.polledReadBlockList[r].addr === t.translationCB(e) && (i("Splicing"), t.polledReadBlockList.splice(r, 1));
  else if (Array.isArray(e))
    for (r = 0; r < t.polledReadBlockList.length; r++)
      for (var n = 0; n < e.length; n++)
        t.polledReadBlockList[r].addr === t.translationCB(e[n]) && t.polledReadBlockList.splice(r, 1);
  t.readPacketValid = !1;
};
c.prototype.readAllItems = function(e) {
  var t = this;
  if (i("Reading All Items (readAllItems was called)", 1, t.connectionID), typeof e == "function" ? t.readDoneCallback = e : t.readDoneCallback = N, t.isoConnectionState !== 4 && i("Unable to read when not connected. Return bad values.", 0, t.connectionID), t.isWaiting()) {
    i("Waiting to read for all R/W operations to complete.  Will re-trigger readAllItems in 100ms.", 0, t.connectionID), clearTimeout(t.rereadTimer), t.rereadTimer = setTimeout(function() {
      t.rereadTimer = void 0, t.readAllItems.apply(t, arguments);
    }, 100, e);
    return;
  }
  t.addRemoveArray.forEach(function(r) {
    i("Adding or Removing " + O.format(r), 1, t.connectionID), r.action === "remove" && t.removeItemsNow(r.arg), r.action === "add" && t.addItemsNow(r.arg);
  }), t.addRemoveArray = [], t.readPacketValid || t.prepareReadPacket(), i("Calling SRP from RAI", 1, t.connectionID), t.sendReadPacket();
};
c.prototype.isWaiting = function() {
  var e = this;
  return e.isReading() || e.isWriting();
};
c.prototype.isReading = function() {
  var e = this, t;
  for (t = 0; t < e.readPacketArray.length; t++)
    if (e.readPacketArray[t].sent === !0)
      return !0;
  return !1;
};
c.prototype.isWriting = function() {
  var e = this, t;
  for (t = 0; t < e.writePacketArray.length; t++)
    if (e.writePacketArray[t].sent === !0)
      return !0;
  return !1;
};
c.prototype.clearReadPacketTimeouts = function() {
  var e = this, t;
  for (i("Clearing read PacketTimeouts", 1, e.connectionID), t = 0; t < e.readPacketArray.length; t++)
    clearTimeout(e.readPacketArray[t].timeout), e.readPacketArray[t].sent = !1, e.readPacketArray[t].rcvd = !1;
};
c.prototype.clearWritePacketTimeouts = function() {
  var e = this, t;
  for (i("Clearing write PacketTimeouts", 1, e.connectionID), t = 0; t < e.writePacketArray.length; t++)
    clearTimeout(e.writePacketArray[t].timeout), e.writePacketArray[t].sent = !1, e.writePacketArray[t].rcvd = !1;
};
c.prototype.prepareWritePacket = function() {
  var e = this, t, r = e.instantWriteBlockList, n = [], a = 0;
  if (r.sort(X), r.length !== 0) {
    e.globalWriteBlockList = [], e.globalWriteBlockList[0] = r[0], e.globalWriteBlockList[0].itemReference = [], e.globalWriteBlockList[0].itemReference.push(r[0]);
    var o = 0;
    r[0].block = o;
    var s = 4 * Math.floor((e.maxPDU - 18 - 12) / 4);
    for (s = 8 * Math.floor((e.maxPDU - 18 - 12) / 8), t = 0; t < r.length; t++)
      e.globalWriteBlockList[t] = r[t], e.globalWriteBlockList[t].isOptimized = !1, e.globalWriteBlockList[t].itemReference = [], e.globalWriteBlockList[t].itemReference.push(r[t]), de(r[t]);
    var l = 0;
    for (t = 0; t < e.globalWriteBlockList.length; t++) {
      var f = e.globalWriteBlockList[t].offset, u = e.globalWriteBlockList[t].byteLength, d = 0;
      n[l] = e.globalWriteBlockList[t].clone(), e.globalWriteBlockList[t].parts = Math.ceil(e.globalWriteBlockList[t].byteLength / s), e.globalWriteBlockList[t].requestReference = [];
      for (var g = 0; g < e.globalWriteBlockList[t].parts; g++)
        n[l] = e.globalWriteBlockList[t].clone(), e.globalWriteBlockList[t].requestReference.push(n[l]), n[l].offset = f, n[l].byteLength = Math.min(s, u), n[l].byteLengthWithFill = n[l].byteLength, n[l].byteLengthWithFill % 2 && (n[l].byteLengthWithFill += 1), n[l].writeBuffer = e.globalWriteBlockList[t].writeBuffer.slice(d, d + n[l].byteLengthWithFill), n[l].writeQualityBuffer = e.globalWriteBlockList[t].writeQualityBuffer.slice(d, d + n[l].byteLengthWithFill), d += e.globalWriteBlockList[t].requestReference[g].byteLength, e.globalWriteBlockList[t].parts > 1 && (n[l].datatype = "BYTE", n[l].dtypelen = 1, n[l].arrayLength = n[l].byteLength), u -= s, l++, f += s;
    }
    for (e.clearWritePacketTimeouts(), e.writePacketArray = []; a < n.length; ) {
      var C = 0;
      e.writeReqHeader.copy(e.writeReq, 0);
      var D = 14;
      e.writePacketArray.push(new z());
      var B = e.writePacketArray.length - 1;
      for (e.writePacketArray[B].seqNum = e.getNextSeqNum(), e.writePacketArray[B].itemList = [], t = a; t < n.length; t++) {
        if (n[t].byteLengthWithFill + 12 + 4 + D > e.maxPDU) {
          if (C === 0)
            throw i("breaking when we shouldn't, byte length with fill is  " + n[t].byteLengthWithFill + " max byte request " + s, 0, e.connectionID), new Error("Somehow write request didn't split properly - exiting.  Report this as a bug.");
          break;
        }
        a++, C++, D += n[t].byteLengthWithFill + 12 + 4, e.writePacketArray[B].itemList.push(n[t]);
      }
    }
  }
};
c.prototype.prepareReadPacket = function() {
  var e = this, t, r = e.polledReadBlockList, n = [];
  for (t = r.length - 1; t >= 0; t--)
    r[t] === void 0 && (r.splice(t, 1), i("Dropping an undefined request item.", 0, e.connectionID));
  if (r.sort(X), r.length !== 0) {
    e.globalReadBlockList = [], e.globalReadBlockList[0] = r[0], e.globalReadBlockList[0].itemReference = [], e.globalReadBlockList[0].itemReference.push(r[0]);
    var a = 0;
    r[0].block = a;
    var o = 4 * Math.floor((e.maxPDU - 18) / 4);
    for (t = 1; t < r.length; t++)
      r[t].areaS7Code !== e.globalReadBlockList[a].areaS7Code || // Can't optimize between areas
      r[t].dbNumber !== e.globalReadBlockList[a].dbNumber || // Can't optimize across DBs
      !e.isOptimizableArea(r[t].areaS7Code) || // Can't optimize T,C (I don't think) and definitely not P.
      r[t].offset - e.globalReadBlockList[a].offset + r[t].byteLength > o || // If this request puts us over our max byte length, create a new block for consistency reasons.
      r[t].offset - (e.globalReadBlockList[a].offset + e.globalReadBlockList[a].byteLength) > e.maxGap ? (i("Skipping optimization of item " + r[t].addr, 0, e.connectionID), a = a + 1, e.globalReadBlockList[a] = r[t], e.globalReadBlockList[a].isOptimized = !1, e.globalReadBlockList[a].itemReference = [], e.globalReadBlockList[a].itemReference.push(r[t])) : (i("Attempting optimization of item " + r[t].addr + " with " + e.globalReadBlockList[a].addr, 0, e.connectionID), e.globalReadBlockList[a].byteLength = Math.max(e.globalReadBlockList[a].byteLength, r[t].offset - e.globalReadBlockList[a].offset + r[t].byteLength), r[t].byteBuffer = e.globalReadBlockList[a].byteBuffer.slice(r[t].offset - e.globalReadBlockList[a].offset, r[t].offset - e.globalReadBlockList[a].offset + r[t].byteLength), r[t].qualityBuffer = e.globalReadBlockList[a].qualityBuffer.slice(r[t].offset - e.globalReadBlockList[a].offset, r[t].offset - e.globalReadBlockList[a].offset + r[t].byteLength), e.globalReadBlockList[a].isOptimized = !0, e.globalReadBlockList[a].itemReference.push(r[t]));
    var s = 0;
    for (t = 0; t < e.globalReadBlockList.length; t++) {
      n[s] = e.globalReadBlockList[t].clone(), e.globalReadBlockList[t].parts = Math.ceil(e.globalReadBlockList[t].byteLength / o), i("self.globalReadBlockList " + t + " parts is " + e.globalReadBlockList[t].parts + " offset is " + e.globalReadBlockList[t].offset + " MBR is " + o, 1, e.connectionID);
      var l = e.globalReadBlockList[t].offset, f = e.globalReadBlockList[t].byteLength;
      e.globalReadBlockList[t].requestReference = [];
      for (var u = 0; u < e.globalReadBlockList[t].parts; u++)
        n[s] = e.globalReadBlockList[t].clone(), e.globalReadBlockList[t].requestReference.push(n[s]), n[s].offset = l, n[s].byteLength = Math.min(o, f), n[s].byteLengthWithFill = n[s].byteLength, n[s].byteLengthWithFill % 2 && (n[s].byteLengthWithFill += 1), e.globalReadBlockList[t].parts > 1 && (n[s].datatype = "BYTE", n[s].dtypelen = 1, n[s].arrayLength = n[s].byteLength), f -= o, s++, l += o;
    }
    var d = 0;
    for (e.clearReadPacketTimeouts(), e.readPacketArray = []; d < n.length; ) {
      var g = 0;
      e.readReqHeader.copy(e.readReq, 0);
      var C = 14, D = 12;
      e.readPacketArray.push(new z());
      var B = e.readPacketArray.length - 1;
      for (e.readPacketArray[B].seqNum = 0, e.readPacketArray[B].itemList = [], t = d; t < n.length; t++) {
        if (n[t].byteLengthWithFill + 4 + C > e.maxPDU || D + 12 > e.maxPDU) {
          if (i("Splitting request: " + g + " items, requestLength would be " + (D + 12) + ", replyLength would be " + (n[t].byteLengthWithFill + 4 + C) + ", PDU is " + e.maxPDU, 1, e.connectionID), g === 0)
            throw i("breaking when we shouldn't, rlibl " + n[t].byteLengthWithFill + " MBR " + o, 0, e.connectionID), new Error("Somehow write request didn't split properly - exiting.  Report this as a bug.");
          break;
        }
        d++, g++, C += n[t].byteLengthWithFill + 4, D += 12, e.readPacketArray[B].itemList.push(n[t]);
      }
    }
    e.readPacketValid = !0;
  }
};
c.prototype.sendReadPacket = function() {
  var e = this, t, r, n = !1;
  for (i("SendReadPacket called", 1, e.connectionID), !e.readPacketArray.length && typeof e.readDoneCallback == "function" && e.readDoneCallback(!1, {}), t = 0; t < e.readPacketArray.length; t++)
    if (!e.readPacketArray[t].sent && !(e.parallelJobsNow >= e.maxParallel)) {
      for (e.readPacketArray[t].seqNum = e.getNextSeqNum(), e.readPacketArray[t].reqTime = process.hrtime(), e.readReq.writeUInt8(e.readPacketArray[t].itemList.length, 18), e.readReq.writeUInt16BE(19 + e.readPacketArray[t].itemList.length * 12, 2), e.readReq.writeUInt16BE(e.readPacketArray[t].seqNum, 11), e.readReq.writeUInt16BE(e.readPacketArray[t].itemList.length * 12 + 2, 13), r = 0; r < e.readPacketArray[t].itemList.length; r++)
        _(e.readPacketArray[t].itemList[r], !1).copy(e.readReq, 19 + r * 12);
      e.isoConnectionState == 4 ? (i("Sending Read Packet With Sequence Number " + e.readPacketArray[t].seqNum, 1, e.connectionID), e.readPacketArray[t].timeout = setTimeout(function() {
        e.packetTimeout.apply(e, arguments);
      }, e.globalTimeout, "read", e.readPacketArray[t].seqNum), e.isoclient.write(e.readReq.slice(0, 19 + e.readPacketArray[t].itemList.length * 12)), e.readPacketArray[t].sent = !0, e.readPacketArray[t].rcvd = !1, e.readPacketArray[t].timeoutError = !1, e.parallelJobsNow += 1) : (e.readPacketArray[t].sent = !0, e.readPacketArray[t].rcvd = !1, e.readPacketArray[t].timeoutError = !0, n || i("Not Sending Read Packet because we are not connected - ISO CS is " + e.isoConnectionState, 0, e.connectionID), e.isoConnectionState === 0 && (n = !0), i("Requesting PacketTimeout Due to ISO CS NOT 4 - READ SN " + e.readPacketArray[t].seqNum, 1, e.connectionID), e.readPacketArray[t].timeout = setTimeout(function() {
        e.packetTimeout.apply(e, arguments);
      }, 0, "read", e.readPacketArray[t].seqNum));
    }
};
c.prototype.sendWritePacket = function() {
  var e = this, t, r, n, a;
  for (r = Buffer.alloc(8192), e.writeInQueue = !1, t = 0; t < e.writePacketArray.length; t++)
    if (!e.writePacketArray[t].sent && !(e.parallelJobsNow >= e.maxParallel)) {
      e.writePacketArray[t].reqTime = process.hrtime(), e.writeReq.writeUInt8(e.writePacketArray[t].itemList.length, 18), e.writeReq.writeUInt16BE(e.writePacketArray[t].seqNum, 11), a = 0;
      for (var o = 0; o < e.writePacketArray[t].itemList.length; o++)
        _(e.writePacketArray[t].itemList[o], !0).copy(e.writeReq, 19 + o * 12), n = ce(e.writePacketArray[t].itemList[o]), n.copy(r, a), a += n.length, o < e.writePacketArray[t].itemList.length - 1 && n.length % 2 && (a += 1);
      e.writeReq.writeUInt16BE(19 + e.writePacketArray[t].itemList.length * 12 + a, 2), e.writeReq.writeUInt16BE(e.writePacketArray[t].itemList.length * 12 + 2, 13), e.writeReq.writeUInt16BE(a, 15), r.copy(e.writeReq, 19 + e.writePacketArray[t].itemList.length * 12, 0, a), e.isoConnectionState === 4 ? (e.writePacketArray[t].timeout = setTimeout(function() {
        e.packetTimeout.apply(e, arguments);
      }, e.globalTimeout, "write", e.writePacketArray[t].seqNum), e.isoclient.write(e.writeReq.slice(0, 19 + a + e.writePacketArray[t].itemList.length * 12)), e.writePacketArray[t].sent = !0, e.writePacketArray[t].rcvd = !1, e.writePacketArray[t].timeoutError = !1, e.parallelJobsNow += 1, i("Sending Write Packet With Sequence Number " + e.writePacketArray[t].seqNum, 1, e.connectionID)) : (e.writePacketArray[t].sent = !0, e.writePacketArray[t].rcvd = !1, e.writePacketArray[t].timeoutError = !0, e.writePacketArray[t].timeout = setTimeout(function() {
        e.packetTimeout.apply(e, arguments);
      }, 0, "write", e.writePacketArray[t].seqNum), e.isoConnectionState);
    }
};
c.prototype.isOptimizableArea = function(e) {
  var t = this;
  if (t.doNotOptimize)
    return !1;
  switch (e) {
    case 132:
    case 129:
    case 130:
    case 131:
      return !0;
    default:
      return !1;
  }
};
c.prototype.onResponse = function(e) {
  var t = this;
  if (!(e && e.length > 6)) {
    i("INVALID READ RESPONSE - DISCONNECTING"), i("The incoming packet doesn't have the required minimum length of 7 bytes"), i(e), t.connectionReset();
    return;
  }
  var r = Q(e);
  if (r === "fastACK")
    i("Fast Acknowledge received.", 0, t.connectionID), t.isoclient.removeAllListeners("error"), t.isoclient.removeAllListeners("data"), t.isoclient.on("data", function() {
      t.onResponse.apply(t, arguments);
    }), t.isoclient.on("error", function() {
      t.readWriteError.apply(t, arguments);
    });
  else if (r[7] === 50) {
    if (r.length > 8 && r[8] != 3)
      return i("PDU type (byte 8) was returned as " + r[8] + " where the response PDU of 3 was expected."), i("Maybe you are requesting more than 240 bytes of data in a packet?"), i(r), t.connectionReset(), null;
    if (r.length > r.readInt16BE(2) && (i("An oversize packet was detected.  Excess length is " + (r.length - r.readInt16BE(2)) + ".  "), i("We assume this is because two packets were sent at nearly the same time by the PLC."), i("We are slicing the buffer and scheduling the second half for further processing next loop."), setTimeout(function() {
      t.onResponse.apply(t, arguments);
    }, 0, r.slice(r.readInt16BE(2)))), r.length < r.readInt16BE(2) || r.readInt16BE(2) < 22 || r[5] !== 240 || r[4] + 1 + 12 + 4 + r.readInt16BE(13) + r.readInt16BE(15) !== r.readInt16BE(2) || !(r[6] >> 7) || r[7] !== 50 || r[8] !== 3)
      return i("INVALID READ RESPONSE - DISCONNECTING"), i("TPKT Length From Header is " + r.readInt16BE(2) + " and RCV buffer length is " + r.length + " and COTP length is " + r.readUInt8(4) + " and data[6] is " + r[6]), i(r), t.connectionReset(), null;
    i("Received " + r.readUInt16BE(15) + " bytes of S7-data from PLC.  Sequence number is " + r.readUInt16BE(11), 1, t.connectionID);
    var n, a, o;
    if (n = t.findReadIndexOfSeqNum(r.readUInt16BE(11)), n === void 0 ? (n = t.findWriteIndexOfSeqNum(r.readUInt16BE(11)), n !== void 0 && (t.writeResponse(r, n), o = !0)) : (a = !0, t.readResponse(r, n)), !a && !o)
      return i("Sequence number that arrived wasn't a write reply either - dropping"), i(r), null;
  } else
    return i("INVALID READ RESPONSE - DISCONNECTING"), i("TPKT Length From Header is " + e.readInt16BE(2) + " and RCV buffer length is " + e.length + " and COTP length is " + e.readUInt8(4) + " and data[6] is " + e[6]), i(e), t.connectionReset(), null;
};
c.prototype.findReadIndexOfSeqNum = function(e) {
  var t = this, r;
  for (r = 0; r < t.readPacketArray.length; r++)
    if (t.readPacketArray[r].seqNum == e)
      return r;
};
c.prototype.findWriteIndexOfSeqNum = function(e) {
  var t = this, r;
  for (r = 0; r < t.writePacketArray.length; r++)
    if (t.writePacketArray[r].seqNum == e)
      return r;
};
c.prototype.writeResponse = function(e, t) {
  for (var r = this, n = 21, a, o, s = 0; s < r.writePacketArray[t].itemList.length; s++)
    if (n = oe(e, r.writePacketArray[t].itemList[s], n), !n) {
      i("Stopping Processing Write Response Packet due to unrecoverable packet error");
      break;
    }
  if (r.writePacketArray[t].reqTime = process.hrtime(r.writePacketArray[t].reqTime), i("Time is " + r.writePacketArray[t].reqTime[0] + " seconds and " + Math.round(r.writePacketArray[t].reqTime[1] * 10 / 1e6) / 10 + " ms.", 1, r.connectionID), r.writePacketArray[t].rcvd || (r.writePacketArray[t].rcvd = !0, r.parallelJobsNow--), clearTimeout(r.writePacketArray[t].timeout), !r.writePacketArray.every(F))
    i("Not done sending - sending more packets from writeResponse", 1, r.connectionID), r.sendWritePacket();
  else {
    for (i("Received all packets in writeResponse", 1, r.connectionID), a = 0; a < r.writePacketArray.length; a++)
      r.writePacketArray[a].sent = !1, r.writePacketArray[a].rcvd = !1;
    for (o = !1, a = 0; a < r.globalWriteBlockList.length; a++) {
      se(r.globalWriteBlockList[a]);
      for (var l = 0; l < r.globalWriteBlockList[a].itemReference.length; l++)
        i(r.globalWriteBlockList[a].itemReference[l].addr + " write completed with quality " + r.globalWriteBlockList[a].itemReference[l].writeQuality, 0, r.connectionID), S(r.globalWriteBlockList[a].itemReference[l].writeQuality) || (o = !0);
      S(r.globalWriteBlockList[a].writeQuality) || (o = !0);
    }
    r.resetPending && (i("Calling reset from writeResponse as there is one pending", 0, r.connectionID), r.resetNow()), r.isoConnectionState === 0 && r.connectNow(r.connectionParams, !1), i("We are calling back our writeDoneCallback.", 1, r.connectionID), typeof r.writeDoneCallback == "function" && r.writeDoneCallback(o);
  }
};
function F(e) {
  return !!(e.sent && e.rcvd);
}
c.prototype.readResponse = function(e, t) {
  var r = this, n, a, o = 21, s = {};
  if (i("ReadResponse called", 1, r.connectionID), !r.readPacketArray[t].sent)
    return i("WARNING: Received a read response packet that was not marked as sent", 0, r.connectionID), null;
  if (r.readPacketArray[t].rcvd)
    return i("WARNING: Received a read response packet that was already marked as received", 0, r.connectionID), null;
  for (var l = 0; l < r.readPacketArray[t].itemList.length; l++)
    o = ie(e, r.readPacketArray[t].itemList[l], o, r.connectionID), o || i("Received a ZERO RESPONSE Processing Read Packet due to unrecoverable packet error", 0, r.connectionID);
  if (r.readPacketArray[t].reqTime = process.hrtime(r.readPacketArray[t].reqTime), i("Time is " + r.readPacketArray[t].reqTime[0] + " seconds and " + Math.round(r.readPacketArray[t].reqTime[1] * 10 / 1e6) / 10 + " ms.", 1, r.connectionID), r.readPacketArray[t].rcvd || (r.readPacketArray[t].rcvd = !0, r.parallelJobsNow--), clearTimeout(r.readPacketArray[t].timeout), r.readPacketArray.every(F)) {
    for (n = 0; n < r.readPacketArray.length; n++)
      r.readPacketArray[n].sent = !1, r.readPacketArray[n].rcvd = !1;
    for (a = !1, n = 0; n < r.globalReadBlockList.length; n++) {
      for (var f = 0, u = 0; u < r.globalReadBlockList[n].requestReference.length; u++)
        r.globalReadBlockList[n].requestReference[u].byteBuffer.copy(r.globalReadBlockList[n].byteBuffer, f, 0, r.globalReadBlockList[n].requestReference[u].byteLength), r.globalReadBlockList[n].requestReference[u].qualityBuffer.copy(r.globalReadBlockList[n].qualityBuffer, f, 0, r.globalReadBlockList[n].requestReference[u].byteLength), f += r.globalReadBlockList[n].requestReference[u].byteLength;
      for (var d = 0; d < r.globalReadBlockList[n].itemReference.length; d++)
        le(r.globalReadBlockList[n].itemReference[d]), i("Address " + r.globalReadBlockList[n].itemReference[d].addr + " has value " + r.globalReadBlockList[n].itemReference[d].value + " and quality " + r.globalReadBlockList[n].itemReference[d].quality, 1, r.connectionID), S(r.globalReadBlockList[n].itemReference[d].quality) ? s[r.globalReadBlockList[n].itemReference[d].useraddr] = r.globalReadBlockList[n].itemReference[d].value : (a = !0, s[r.globalReadBlockList[n].itemReference[d].useraddr] = r.globalReadBlockList[n].itemReference[d].quality);
    }
    r.writeInQueue ? i("Write In Queue.  ICS " + r.isoConnectionState + " resetPending " + r.resetPending, 1, r.connectionID) : (r.resetPending && (i("Calling reset from readResponse as there is one pending", 0, r.connectionID), r.resetNow()), r.isoConnectionState === 0 && r.connectNow(r.connectionParams, !1)), i("We are calling back our readDoneCallback.", 1, r.connectionID), typeof r.readDoneCallback == "function" && r.readDoneCallback(a, s), !r.isReading() && r.writeInQueue && (i("SendWritePacket called because write was queued.", 0, r.connectionID), r.sendWritePacket());
  } else
    r.sendReadPacket();
};
c.prototype.onClientDisconnect = function() {
  var e = this;
  i("ISO-on-TCP connection DISCONNECTED.", 0, e.connectionID), !e.connectCBIssued && typeof e.connectCallback == "function" && (e.connectCBIssued = !0, e.connectCallback("Error - TCP connected, ISO didn't")), e.connectionReset();
};
c.prototype.onClientClose = function() {
  var e = this;
  e.connectionReset(), e.dropConnectionCallback && (e.dropConnectionCallback(), e.dropConnectionCallback = null, clearTimeout(e.dropConnectionTimer));
};
c.prototype.connectionReset = function() {
  var e = this;
  e.isoConnectionState = 0, e.resetPending = !0, i("ConnectionReset has been called to set the reset as pending", 0, e.connectionID), !e.isReading() && !e.isWriting() && !e.writeInQueue && typeof e.resetTimeout > "u" && (e.resetTimeout = setTimeout(function() {
    i("Timed reset has happened. Ideally this would never be called as reset should be completed when done r/w.", 0, e.connectionID), e.resetNow.apply(e, arguments);
  }, 3500));
};
c.prototype.resetNow = function() {
  var e = this;
  e.isoConnectionState = 0, e.isoclient.end(), i("ResetNOW is happening", 0, e.connectionID), e.resetPending = !1, typeof e.resetTimeout < "u" && (clearTimeout(e.resetTimeout), e.resetTimeout = void 0, i("Clearing an earlier scheduled reset", 0, e.connectionID));
};
c.prototype.connectionCleanup = function() {
  var e = this;
  e.isoConnectionState = 0, i("Connection cleanup is happening", 0, e.connectionID), typeof e.isoclient < "u" && (e.isoclient.destroy(), e.isoclient.removeAllListeners("data"), e.isoclient.removeAllListeners("error"), e.isoclient.removeAllListeners("connect"), e.isoclient.removeAllListeners("end"), e.isoclient.removeAllListeners("close"), e.isoclient.on("error", function() {
    i("TCP socket error following connection cleanup");
  })), clearTimeout(e.connectTimeout), clearTimeout(e.PDUTimeout), e.clearReadPacketTimeouts(), e.clearWritePacketTimeouts();
};
function Q(e) {
  var t = null, r = e[0], n = e.readInt16BE(2), a = e[5], o = e[6];
  return r !== 3 && a !== 240 ? "error" : (!(o >> 7) && n == e.length && e.length === 7 ? t = "fastACK" : o >> 7 == 1 && n <= e.length ? t = e : !(o >> 7) && n !== e.length ? t = e.slice(7, e.length) : t = "error", t);
}
function _(e, t) {
  var r = 0, n = Buffer.from([18, 10, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  return n[3] = 2, e.datatype === "X" ? (n.writeUInt16BE(e.byteLength, 4), t && e.arrayLength === 1 && (n[3] = 1, r = e.bitOffset)) : e.datatype === "TIMER" || e.datatype === "COUNTER" ? (n.writeUInt16BE(1, 4), n.writeUInt8(e.areaS7Code, 3)) : n.writeUInt16BE(e.byteLength, 4), n.writeUInt16BE(e.dbNumber, 6), n.writeUInt32BE(e.offset * 8 + r, 8), n[8] |= e.areaS7Code, n;
}
function ie(e, t, r, n) {
  var a;
  if (typeof e > "u")
    a = 0, i("Processing an undefined packet, likely due to timeout error", 0, n);
  else {
    if (isNaN(t.byteLength))
      return i("Processing an undefined packet, perhaps bad input?", 0, n), 0;
    a = e.length - r;
  }
  var o = r;
  if (t.qualityBuffer = Buffer.alloc(t.byteLength), t.qualityBuffer.fill(255), a < 4)
    return t.valid = !1, typeof e < "u" ? t.errCode = "Malformed Packet - Less Than 4 Bytes.  TDL" + e.length + "TP" + r + "RL" + a : t.errCode = "Timeout error - zero length packet", i(t.errCode, 0, n), 0;
  var s;
  t.readTransportCode == 4 ? s = e.readUInt16BE(r + 2) / 8 : s = e.readUInt16BE(r + 2);
  var l = e[r], f = e[r + 1];
  if (a == s + 2 && i("Not last part.", 0, n), a < s + 2)
    return t.valid = !1, t.errCode = "Malformed Packet - Item Data Length and Packet Length Disagree.  RDL+2 " + (s + 2) + " remainingLength " + a, i(t.errCode, 0, n), 0;
  if (l !== 255)
    return t.valid = !1, t.errCode = "Invalid Response Code - " + l, i(t.errCode, 0, n), r + s + 4;
  if (f !== t.readTransportCode)
    return t.valid = !1, t.errCode = "Invalid Transport Code - " + f, i(t.errCode, 0, n), r + s + 4;
  var u = t.byteLength;
  return s !== u ? (t.valid = !1, t.errCode = "Invalid Response Length - Expected " + u + " but got " + s + " bytes.", i(t.errCode, 0, n), s + 2) : (r += 4, t.valid = !0, t.byteBuffer = e.slice(r, r + s), t.qualityBuffer.fill(192), r += t.byteLength, (r - o) % 2 && (r += 1), r);
}
function oe(e, t, r) {
  var n;
  if (!e)
    return t.writeQualityBuffer.fill(255), t.valid = !1, t.errCode = "We must have timed Out - we have no response to process", i(t.errCode), 0;
  if (n = e.length - r, n < 1)
    return t.writeQualityBuffer.fill(255), t.valid = !1, t.errCode = "Malformed Packet - Less Than 1 Byte.  TDL " + e.length + " TP" + r + " RL" + n, i(t.errCode), 0;
  var a = e.readUInt8(r);
  return t.writeResponse = a, a !== 255 ? (i("Received write error of " + t.writeResponse + " on " + t.addr), t.writeQualityBuffer.fill(255)) : t.writeQualityBuffer.fill(192), r + 1;
}
function se(e) {
  var t = 0;
  if (e.arrayLength === 1)
    e.writeQualityBuffer[0] === 255 ? e.writeQuality = "BAD" : e.writeQuality = "OK";
  else {
    e.writeQuality = [];
    for (var r = 0; r < e.arrayLength; r++)
      e.writeQualityBuffer[t] === 255 ? e.writeQuality[r] = "BAD" : e.writeQuality[r] = "OK", e.datatype == "X" ? ((r + e.bitOffset + 1) % 8 === 0 || r == e.arrayLength - 1) && (t += e.dtypelen) : t += e.dtypelen;
  }
}
function w(e) {
  return (e >> 4) * 10 + (e & 15);
}
function p(e) {
  return e / 10 << 4 | e % 10;
}
function A(e, t, r) {
  let n = w(e.readUInt8(t)), a = w(e.readUInt8(t + 1)), o = w(e.readUInt8(t + 2)), s = w(e.readUInt8(t + 3)), l = w(e.readUInt8(t + 4)), f = w(e.readUInt8(t + 5)), u = w(e.readUInt8(t + 6)), d = w(e.readUInt8(t + 7) & 240), g;
  return r ? g = new Date(Date.UTC(
    (n > 89 ? 1900 : 2e3) + n,
    a - 1,
    o,
    s,
    l,
    f,
    u * 10 + d / 10
  )) : g = new Date(
    (n > 89 ? 1900 : 2e3) + n,
    a - 1,
    o,
    s,
    l,
    f,
    u * 10 + d / 10
  ), g;
}
function E(e, t, r, n) {
  if (!(e instanceof Date))
    if (e > 631152e6 && e < 3786911999999)
      e = new Date(e);
    else {
      i("Unsupported value of [" + e + "] for writing data of type DATE_AND_TIME. Skipping item");
      return;
    }
  n ? (t.writeUInt8(p(e.getUTCFullYear() % 100), r), t.writeUInt8(p(e.getUTCMonth() + 1), r + 1), t.writeUInt8(p(e.getUTCDate()), r + 2), t.writeUInt8(p(e.getUTCHours()), r + 3), t.writeUInt8(p(e.getUTCMinutes()), r + 4), t.writeUInt8(p(e.getUTCSeconds()), r + 5), t.writeUInt8(p(e.getUTCMilliseconds() / 10 >> 0), r + 6), t.writeUInt8(p(e.getUTCMilliseconds() % 10 * 10 + (e.getUTCDay() + 1)), r + 7)) : (t.writeUInt8(p(e.getFullYear() % 100), r), t.writeUInt8(p(e.getMonth() + 1), r + 1), t.writeUInt8(p(e.getDate()), r + 2), t.writeUInt8(p(e.getHours()), r + 3), t.writeUInt8(p(e.getMinutes()), r + 4), t.writeUInt8(p(e.getSeconds()), r + 5), t.writeUInt8(p(e.getMilliseconds() / 10 >> 0), r + 6), t.writeUInt8(p(e.getMilliseconds() % 10 * 10 + (e.getDay() + 1)), r + 7));
}
function h(e, t, r) {
  let n = e.readUInt16BE(t), a = e.readUInt8(t + 2), o = e.readUInt8(t + 3), s = e.readUInt8(t + 5), l = e.readUInt8(t + 6), f = e.readUInt8(t + 7), u = e.readUInt32BE(t + 8), d;
  return r ? d = new Date(Date.UTC(
    n,
    a - 1,
    o,
    s,
    l,
    f,
    u / 1e6
  )) : d = new Date(
    n,
    a - 1,
    o,
    s,
    l,
    f,
    u / 1e6
  ), d;
}
function m(e, t, r, n) {
  if (!(e instanceof Date))
    if (e >= 0 && e < 9223382836854)
      e = new Date(e);
    else {
      i("Unsupported value of [" + e + "] for writing data of type DATE_AND_TIME. Skipping item");
      return;
    }
  n ? (t.writeUInt16BE(e.getUTCFullYear(), r), t.writeUInt8(e.getUTCMonth() + 1, r + 2), t.writeUInt8(e.getUTCDate(), r + 3), t.writeUInt8(e.getUTCDay() + 1, r + 4), t.writeUInt8(e.getUTCHours(), r + 5), t.writeUInt8(e.getUTCMinutes(), r + 6), t.writeUInt8(e.getUTCSeconds(), r + 7), t.writeUInt32BE(e.getUTCMilliseconds() * 1e6, r + 8)) : (t.writeUInt16BE(e.getFullYear(), r), t.writeUInt8(e.getMonth() + 1, r + 2), t.writeUInt8(e.getDate(), r + 3), t.writeUInt8(e.getDay() + 1, r + 4), t.writeUInt8(e.getHours(), r + 5), t.writeUInt8(e.getMinutes(), r + 6), t.writeUInt8(e.getSeconds(), r + 7), t.writeUInt32BE(e.getMilliseconds() * 1e6, r + 8));
}
function le(e) {
  var t = 0, r = 0, n = "";
  if (e.arrayLength > 1) {
    e.datatype != "C" && e.datatype != "CHAR" ? (e.value = [], e.quality = []) : (e.value = "", e.quality = "");
    for (var a = e.bitOffset, o = 0; o < e.arrayLength; o++) {
      if (e.qualityBuffer[t] !== 192)
        e.quality instanceof Array ? (e.value.push(e.badValue()), e.quality.push("BAD " + e.qualityBuffer[t])) : (e.value = e.badValue(), e.quality = "BAD " + e.qualityBuffer[t]);
      else
        switch (e.quality instanceof Array ? e.quality.push("OK") : e.quality = "OK", e.datatype) {
          case "DT":
            e.value.push(A(e.byteBuffer, t, !1));
            break;
          case "DTZ":
            e.value.push(A(e.byteBuffer, t, !0));
            break;
          case "DTL":
            e.value.push(h(e.byteBuffer, t, !1));
            break;
          case "DTLZ":
            e.value.push(h(e.byteBuffer, t, !0));
            break;
          case "REAL":
            e.value.push(e.byteBuffer.readFloatBE(t));
            break;
          case "LREAL":
            e.value.push(e.byteBuffer.readDoubleBE(t));
            break;
          case "LINT":
            break;
          case "DWORD":
            e.value.push(e.byteBuffer.readUInt32BE(t));
            break;
          case "DINT":
            e.value.push(e.byteBuffer.readInt32BE(t));
            break;
          case "INT":
            e.value.push(e.byteBuffer.readInt16BE(t));
            break;
          case "WORD":
            e.value.push(e.byteBuffer.readUInt16BE(t));
            break;
          case "X":
            e.value.push(!!(e.byteBuffer.readUInt8(t) >> a & 1));
            break;
          case "B":
          case "BYTE":
            e.value.push(e.byteBuffer.readUInt8(t));
            break;
          case "S":
          case "STRING":
            r = e.byteBuffer.readUInt8(t + 1), n = "";
            for (var s = 2; s < e.dtypelen && s - 2 < r; s++)
              n += String.fromCharCode(e.byteBuffer.readUInt8(t + s));
            e.value.push(n);
            break;
          case "C":
          case "CHAR":
            e.value += String.fromCharCode(e.byteBuffer.readUInt8(t));
            break;
          case "TIMER":
          case "COUNTER":
            e.value.push(e.byteBuffer.readInt16BE(t));
            break;
          default:
            return i("Unknown data type in response - should never happen.  Should have been caught earlier.  " + e.datatype), 0;
        }
      e.datatype == "X" ? (a++, ((o + e.bitOffset + 1) % 8 === 0 || o == e.arrayLength - 1) && (t += e.dtypelen, a = 0)) : t += e.dtypelen;
    }
  } else {
    if (e.qualityBuffer[t] !== 192)
      e.value = e.badValue(), e.quality = "BAD " + e.qualityBuffer[t];
    else
      switch (e.quality = "OK", e.datatype) {
        case "DT":
          e.value = A(e.byteBuffer, t, !1);
          break;
        case "DTZ":
          e.value = A(e.byteBuffer, t, !0);
          break;
        case "DTL":
          e.value = h(e.byteBuffer, t, !1);
          break;
        case "DTLZ":
          e.value = h(e.byteBuffer, t, !0);
          break;
        case "REAL":
          e.value = e.byteBuffer.readFloatBE(t);
          break;
        case "LREAL":
          e.value = e.byteBuffer.readDoubleBE(t);
          break;
        case "LINT":
          break;
        case "DWORD":
          e.value = e.byteBuffer.readUInt32BE(t);
          break;
        case "DINT":
          e.value = e.byteBuffer.readInt32BE(t);
          break;
        case "INT":
          e.value = e.byteBuffer.readInt16BE(t);
          break;
        case "WORD":
          e.value = e.byteBuffer.readUInt16BE(t);
          break;
        case "X":
          e.value = !!(e.byteBuffer.readUInt8(t) >> e.bitOffset & 1);
          break;
        case "B":
        case "BYTE":
          e.value = e.byteBuffer.readUInt8(t);
          break;
        case "S":
        case "STRING":
          r = e.byteBuffer.readUInt8(t + 1), e.value = "";
          for (var s = 2; s < e.dtypelen && s - 2 < r; s++)
            e.value += String.fromCharCode(e.byteBuffer.readUInt8(t + s));
          break;
        case "C":
        case "CHAR":
          e.value = String.fromCharCode(e.byteBuffer.readUInt8(t));
          break;
        case "TIMER":
        case "COUNTER":
          e.value = e.byteBuffer.readInt16BE(t);
          break;
        default:
          return i("Unknown data type in response - should never happen.  Should have been caught earlier.  " + e.datatype), 0;
      }
    t += e.dtypelen;
  }
  return t % 2 && (t += 1), t;
}
function ce(e) {
  var t;
  return e.datatype === "X" && e.arrayLength === 1 ? (t = Buffer.alloc(5), t.fill(0), t.writeUInt16BE(1, 2)) : (t = Buffer.alloc(e.byteLength + 4), t.fill(0), t.writeUInt16BE(e.byteLength * 8, 2)), e.writeBuffer.length < e.byteLengthWithFill && i("Attempted to access part of the write buffer that wasn't there when writing an item."), t[0] = 0, t[1] = e.writeTransportCode, e.writeBuffer.copy(t, 4, 0, e.byteLength), t;
}
function de(e) {
  var t, r;
  if (r = 0, t = 0, e.arrayLength > 1)
    for (var n = e.bitOffset, a = 0; a < e.arrayLength; a++) {
      switch (e.datatype) {
        case "DT":
          E(e.writeValue[a], e.writeBuffer, t, !1);
          break;
        case "DTZ":
          E(e.writeValue[a], e.writeBuffer, t, !0);
          break;
        case "DTL":
          m(e.writeValue[a], e.writeBuffer, t, !1);
          break;
        case "DTLZ":
          m(e.writeValue[a], e.writeBuffer, t, !0);
          break;
        case "REAL":
          e.writeBuffer.writeFloatBE(e.writeValue[a], t);
          break;
        case "LREAL":
          e.writeBuffer.writeDoubleBE(e.writeValue[a], t);
          break;
        case "LINT":
          break;
        case "DWORD":
          e.writeBuffer.writeInt32BE(e.writeValue[a], t);
          break;
        case "DINT":
          e.writeBuffer.writeInt32BE(e.writeValue[a], t);
          break;
        case "INT":
          e.writeBuffer.writeInt16BE(e.writeValue[a], t);
          break;
        case "WORD":
          e.writeBuffer.writeUInt16BE(e.writeValue[a], t);
          break;
        case "X":
          r = r | (e.writeValue[a] === !0 ? 1 : 0) << n, e.writeBuffer.writeUInt8(r, t), n++;
          break;
        case "B":
        case "BYTE":
          e.writeBuffer.writeUInt8(e.writeValue[a], t);
          break;
        case "C":
        case "CHAR":
          e.writeBuffer.writeUInt8(e.writeValue.charCodeAt(a), t);
          break;
        case "S":
        case "STRING":
          e.writeBuffer.writeUInt8(e.dtypelen - 2, t), e.writeBuffer.writeUInt8(Math.min(e.dtypelen - 2, e.writeValue[a].length), t + 1);
          for (var o = 2; o < e.dtypelen; o++)
            o < e.writeValue[a].length + 2 ? e.writeBuffer.writeUInt8(e.writeValue[a].charCodeAt(o - 2), t + o) : e.writeBuffer.writeUInt8(32, t + o);
          break;
        case "TIMER":
        case "COUNTER":
          e.writeBuffer.writeInt16BE(e.writeValue[a], t);
          break;
        default:
          return i("Unknown data type when preparing array write packet - should never happen.  Should have been caught earlier.  " + e.datatype), 0;
      }
      e.datatype == "X" ? ((a + e.bitOffset + 1) % 8 === 0 || a == e.arrayLength - 1) && (t += e.dtypelen, n = 0, r = 0) : t += e.dtypelen;
    }
  else {
    switch (e.datatype) {
      case "DT":
        E(e.writeValue, e.writeBuffer, t, !1);
        break;
      case "DTZ":
        E(e.writeValue, e.writeBuffer, t, !0);
        break;
      case "DTL":
        m(e.writeValue, e.writeBuffer, t, !1);
        break;
      case "DTLZ":
        m(e.writeValue, e.writeBuffer, t, !0);
        break;
      case "REAL":
        e.writeBuffer.writeFloatBE(e.writeValue, t);
        break;
      case "LREAL":
        e.writeBuffer.writeDoubleBE(e.writeValue, t);
        break;
      case "LINT":
        break;
      case "DWORD":
        e.writeBuffer.writeUInt32BE(e.writeValue, t);
        break;
      case "DINT":
        e.writeBuffer.writeInt32BE(e.writeValue, t);
        break;
      case "INT":
        e.writeBuffer.writeInt16BE(e.writeValue, t);
        break;
      case "WORD":
        e.writeBuffer.writeUInt16BE(e.writeValue, t);
        break;
      case "X":
        e.writeBuffer.writeUInt8(e.writeValue === !0 ? 1 : 0, t);
        break;
      case "B":
      case "BYTE":
        e.writeBuffer.writeUInt8(e.writeValue, t);
        break;
      case "C":
      case "CHAR":
        e.writeBuffer.writeUInt8(e.writeValue.charCodeAt(0), t);
        break;
      case "S":
      case "STRING":
        e.writeBuffer.writeUInt8(e.dtypelen - 2, t), e.writeBuffer.writeUInt8(Math.min(e.dtypelen - 2, e.writeValue.length), t + 1);
        for (var o = 2; o < e.dtypelen; o++)
          o < e.writeValue.length + 2 ? e.writeBuffer.writeUInt8(e.writeValue.charCodeAt(o - 2), t + o) : e.writeBuffer.writeUInt8(32, t + o);
        break;
      case "TIMER":
      case "COUNTER":
        e.writeBuffer.writeInt16BE(e.writeValue, t);
        break;
      default:
        return i("Unknown data type in write prepare - should never happen.  Should have been caught earlier.  " + e.datatype), 0;
    }
    t += e.dtypelen;
  }
}
function U(e, t, r) {
  var n, a, o;
  if (t !== "_COMMERR") {
    if (n = new H(), a = e.split(","), a.length === 0 || a.length > 2) {
      i("Error - String Couldn't Split Properly.");
      return;
    }
    if (a.length > 1) {
      if (n.addrtype = "DB", o = a[1].split("."), n.datatype = o[0].replace(/[0-9]/gi, "").toUpperCase(), n.datatype === "X" && o.length === 3 ? n.arrayLength = parseInt(o[2], 10) : (n.datatype === "S" || n.datatype === "STRING") && o.length === 3 ? (n.dtypelen = parseInt(o[1], 10) + 2, n.arrayLength = parseInt(o[2], 10)) : (n.datatype === "S" || n.datatype === "STRING") && o.length === 2 ? (n.dtypelen = parseInt(o[1], 10) + 2, n.arrayLength = 1) : n.datatype !== "X" && o.length === 2 ? n.arrayLength = parseInt(o[1], 10) : n.arrayLength = 1, n.arrayLength <= 0) {
        i("Zero length arrays not allowed, returning undefined");
        return;
      }
      if (n.dbNumber = parseInt(a[0].replace(/[A-z]/gi, ""), 10), n.offset = parseInt(o[0].replace(/[A-z]/gi, ""), 10), o.length > 1 && n.datatype === "X" && (n.bitOffset = parseInt(o[1], 10), n.bitOffset > 7)) {
        i("Invalid bit offset specified for address " + e);
        return;
      }
    } else {
      switch (o = e.split("."), o[0].replace(/[0-9]/gi, "")) {
        case "PIB":
        case "PEB":
        case "PQB":
        case "PAB":
          n.addrtype = "P", n.datatype = "BYTE";
          break;
        case "PIC":
        case "PEC":
        case "PQC":
        case "PAC":
          n.addrtype = "P", n.datatype = "CHAR";
          break;
        case "PIW":
        case "PEW":
        case "PQW":
        case "PAW":
          n.addrtype = "P", n.datatype = "WORD";
          break;
        case "PII":
        case "PEI":
        case "PQI":
        case "PAI":
          n.addrtype = "P", n.datatype = "INT";
          break;
        case "PID":
        case "PED":
        case "PQD":
        case "PAD":
          n.addrtype = "P", n.datatype = "DWORD";
          break;
        case "PIDI":
        case "PEDI":
        case "PQDI":
        case "PADI":
          n.addrtype = "P", n.datatype = "DINT";
          break;
        case "PIR":
        case "PER":
        case "PQR":
        case "PAR":
          n.addrtype = "P", n.datatype = "REAL";
          break;
        case "I":
        case "E":
          n.addrtype = "I", n.datatype = "X";
          break;
        case "IB":
        case "EB":
          n.addrtype = "I", n.datatype = "BYTE";
          break;
        case "IC":
        case "EC":
          n.addrtype = "I", n.datatype = "CHAR";
          break;
        case "IW":
        case "EW":
          n.addrtype = "I", n.datatype = "WORD";
          break;
        case "II":
        case "EI":
          n.addrtype = "I", n.datatype = "INT";
          break;
        case "ID":
        case "ED":
          n.addrtype = "I", n.datatype = "DWORD";
          break;
        case "IDI":
        case "EDI":
          n.addrtype = "I", n.datatype = "DINT";
          break;
        case "IR":
        case "ER":
          n.addrtype = "I", n.datatype = "REAL";
          break;
        case "ILR":
        case "ELR":
          n.addrtype = "I", n.datatype = "LREAL";
          break;
        case "ILI":
        case "ELI":
          n.addrtype = "I", n.datatype = "LINT";
          break;
        case "Q":
        case "A":
          n.addrtype = "Q", n.datatype = "X";
          break;
        case "QB":
        case "AB":
          n.addrtype = "Q", n.datatype = "BYTE";
          break;
        case "QC":
        case "AC":
          n.addrtype = "Q", n.datatype = "CHAR";
          break;
        case "QW":
        case "AW":
          n.addrtype = "Q", n.datatype = "WORD";
          break;
        case "QI":
        case "AI":
          n.addrtype = "Q", n.datatype = "INT";
          break;
        case "QD":
        case "AD":
          n.addrtype = "Q", n.datatype = "DWORD";
          break;
        case "QDI":
        case "ADI":
          n.addrtype = "Q", n.datatype = "DINT";
          break;
        case "QR":
        case "AR":
          n.addrtype = "Q", n.datatype = "REAL";
          break;
        case "QLR":
        case "ALR":
          n.addrtype = "Q", n.datatype = "LREAL";
          break;
        case "QLI":
        case "ALI":
          n.addrtype = "Q", n.datatype = "LINT";
          break;
        case "M":
          n.addrtype = "M", n.datatype = "X";
          break;
        case "MB":
          n.addrtype = "M", n.datatype = "BYTE";
          break;
        case "MC":
          n.addrtype = "M", n.datatype = "CHAR";
          break;
        case "MW":
          n.addrtype = "M", n.datatype = "WORD";
          break;
        case "MI":
          n.addrtype = "M", n.datatype = "INT";
          break;
        case "MD":
          n.addrtype = "M", n.datatype = "DWORD";
          break;
        case "MDI":
          n.addrtype = "M", n.datatype = "DINT";
          break;
        case "MR":
          n.addrtype = "M", n.datatype = "REAL";
          break;
        case "MLR":
          n.addrtype = "M", n.datatype = "LREAL";
          break;
        case "MLI":
          n.addrtype = "M", n.datatype = "LINT";
          break;
        case "T":
          n.addrtype = "T", n.datatype = "TIMER";
          break;
        case "C":
          n.addrtype = "C", n.datatype = "COUNTER";
          break;
        default:
          i("Failed to find a match for " + o[0]);
          return;
      }
      n.bitOffset = 0, o.length > 1 && n.datatype === "X" ? (n.bitOffset = parseInt(o[1].replace(/[A-z]/gi, ""), 10), o.length > 2 ? n.arrayLength = parseInt(o[2].replace(/[A-z]/gi, ""), 10) : n.arrayLength = 1) : o.length > 1 && n.datatype !== "X" ? n.arrayLength = parseInt(o[1].replace(/[A-z]/gi, ""), 10) : n.arrayLength = 1, n.dbNumber = 0, n.offset = parseInt(o[0].replace(/[A-z]/gi, ""), 10);
    }
    switch (n.datatype === "DI" && (n.datatype = "DINT"), n.datatype === "I" && (n.datatype = "INT"), (n.datatype === "DW" || n.datatype === "DWT") && (n.datatype = "DWORD"), n.datatype === "WDT" && (r.wdtAsUTC ? n.datatype = "DTZ" : n.datatype = "DT"), n.datatype === "W" && (n.datatype = "WORD"), n.datatype === "R" && (n.datatype = "REAL"), n.datatype === "LR" && (n.datatype = "LREAL"), n.datatype === "LI" && (n.datatype = "LINT"), n.datatype) {
      case "DTL":
      case "DTLZ":
        n.dtypelen = 12;
        break;
      case "LREAL":
      case "LINT":
      case "DT":
      case "DTZ":
        n.dtypelen = 8;
        break;
      case "REAL":
      case "DWORD":
      case "DINT":
        n.dtypelen = 4;
        break;
      case "INT":
      case "WORD":
      case "TIMER":
      case "COUNTER":
        n.dtypelen = 2;
        break;
      case "X":
      case "B":
      case "C":
      case "BYTE":
      case "CHAR":
        n.dtypelen = 1;
        break;
      case "S":
      case "STRING":
        break;
      default:
        i("Unknown data type " + n.datatype);
        return;
    }
    switch (n.readTransportCode = 4, n.addrtype) {
      case "DB":
      case "DI":
        n.areaS7Code = 132;
        break;
      case "I":
      case "E":
        n.areaS7Code = 129;
        break;
      case "Q":
      case "A":
        n.areaS7Code = 130;
        break;
      case "M":
        n.areaS7Code = 131;
        break;
      case "P":
        n.areaS7Code = 128;
        break;
      case "C":
        n.areaS7Code = 28, n.readTransportCode = 9;
        break;
      case "T":
        n.areaS7Code = 29, n.readTransportCode = 9;
        break;
      default:
        i("Unknown memory area entered - " + n.addrtype);
        return;
    }
    return n.datatype === "X" && n.arrayLength === 1 ? n.writeTransportCode = 3 : n.writeTransportCode = n.readTransportCode, n.addr = e, t === void 0 ? n.useraddr = e : n.useraddr = t, n.datatype === "X" ? n.byteLength = Math.ceil((n.bitOffset + n.arrayLength) / 8) : n.byteLength = n.arrayLength * n.dtypelen, n.byteLengthWithFill = n.byteLength, n.byteLengthWithFill % 2 && (n.byteLengthWithFill += 1), n;
  }
}
function z() {
  this.seqNum = void 0, this.itemList = void 0, this.reqTime = void 0, this.sent = !1, this.rcvd = !1, this.timeoutError = void 0, this.timeout = void 0;
}
function H() {
  this.addr = void 0, this.useraddr = void 0, this.addrtype = void 0, this.datatype = void 0, this.dbNumber = void 0, this.bitOffset = void 0, this.offset = void 0, this.arrayLength = void 0, this.dtypelen = void 0, this.areaS7Code = void 0, this.byteLength = void 0, this.byteLengthWithFill = void 0, this.readTransportCode = void 0, this.writeTransportCode = void 0, this.byteBuffer = Buffer.alloc(8192), this.writeBuffer = Buffer.alloc(8192), this.qualityBuffer = Buffer.alloc(8192), this.writeQualityBuffer = Buffer.alloc(8192), this.value = void 0, this.writeValue = void 0, this.valid = !1, this.errCode = void 0, this.part = void 0, this.maxPart = void 0, this.isOptimized = !1, this.resultReference = void 0, this.itemReference = void 0, this.clone = function() {
    var e = new H();
    for (var t in this)
      t != "clone" && (e[t] = this[t]);
    return e;
  }, this.badValue = function() {
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
        return !1;
      case "C":
      case "CHAR":
      case "S":
      case "STRING":
        return "";
      default:
        return i("Unknown data type when figuring out bad value - should never happen.  Should have been caught earlier.  " + this.datatype), 0;
    }
  };
}
function X(e, t) {
  if (e.areaS7Code < t.areaS7Code)
    return -1;
  if (e.areaS7Code > t.areaS7Code)
    return 1;
  if (e.addrtype === "DB") {
    if (e.dbNumber < t.dbNumber)
      return -1;
    if (e.dbNumber > t.dbNumber)
      return 1;
  }
  if (e.offset < t.offset)
    return -1;
  if (e.offset > t.offset)
    return 1;
  if (e.bitOffset < t.bitOffset)
    return -1;
  if (e.bitOffset > t.bitOffset)
    return 1;
  if (e.byteLength > t.byteLength)
    return -1;
  if (e.byteLength < t.byteLength)
    return 1;
}
function N(e) {
  return e;
}
function S(e) {
  if (typeof e == "string") {
    if (e !== "OK")
      return !1;
  } else if (Array.isArray(e)) {
    for (var t = 0; t < e.length; t++)
      if (typeof e[t] != "string" || e[t] !== "OK")
        return !1;
  }
  return !0;
}
function i(e, t, r) {
  if (!V) {
    var n;
    typeof r > "u" ? n = "" : n = " " + r, (typeof t > "u" || M >= t) && console.log("[" + process.hrtime() + n + "] " + O.format(e));
  }
}
const ue = /* @__PURE__ */ re(ae), L = class L {
  constructor(t = "192.168.2.10", r = 102) {
    v(this, "client");
    v(this, "isConnected", !1);
    this.ip = t, this.port = r, this.client = new ue();
  }
  // 单例访问入口
  static getInstance() {
    return L.instance || (L.instance = new L()), L.instance;
  }
  async connectIfNeeded() {
    if (!this.isConnected)
      return new Promise((t, r) => {
        this.client.initiateConnection(
          { host: this.ip, port: this.port, rack: 0, slot: 1 },
          (n) => {
            if (n) return r(new Error("PLC 连接失败: " + n.message));
            this.isConnected = !0, t();
          }
        );
      });
  }
  defineItems(t) {
    this.client.setTranslationCB((r) => r), this.client.addItems(Object.keys(t));
  }
  // async readAll(): Promise<Record<string, any>> {
  //   await this.connectIfNeeded();
  //   return new Promise((resolve, reject) => {
  //     this.client.readAllItems((err, values) => {
  //       if (err) return reject(new Error('PLC 读取失败: ' + err));
  //       resolve(values);
  //     });
  //   });
  // }
  async writeItems(t, r) {
    return await this.connectIfNeeded(), new Promise((n, a) => {
      this.client.writeItems(t, r, (o) => {
        if (o) return a(new Error("PLC 写入失败"));
        n();
      });
    });
  }
  disconnect() {
    this.isConnected && (this.client.dropConnection(() => {
      console.log("[PLC] Disconnected");
    }), this.isConnected = !1);
  }
};
v(L, "instance");
let T = L;
function fe(e) {
  e.webContents.on("did-finish-load", () => {
    e.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), R.on("win-minimize", () => {
    e.minimize();
  }), R.on("win-maximize", () => {
    e.isMaximized() ? e.restore() : e.maximize();
  }), R.on("win-close", () => {
    k.quit();
  }), R.on("win-toggle-fullscreen", () => {
    e && e.setFullScreen(!e.isFullScreen());
  }), R.handle("win-get-logo", (t, r, n) => {
    if (e)
      try {
        const a = x.readFileSync("D:/logo/logo.png");
        return a ? `data:image/png;base64,${Buffer.from(a).toString("base64")}` : void 0;
      } catch {
      }
  }), R.on("win-check-autoMode", async (t, r) => {
    const n = T.getInstance();
    try {
      await n.writeItems("DB7,X4.2", r);
    } catch {
      I.showErrorBox("PLC Write Error", "Write Address: DBX4.2");
    }
  }), R.on("win-alarm-trigger", async (t, r) => {
    const n = T.getInstance();
    try {
      await n.writeItems("DB7,X4.3", r);
    } catch {
      I.showErrorBox("PLC Write Error", "Write Address: DBX4.3");
    }
  });
}
const K = b.dirname(j(import.meta.url));
process.env.APP_ROOT = b.join(K, "..");
const W = process.env.VITE_DEV_SERVER_URL, Le = b.join(process.env.APP_ROOT, "dist-electron"), G = b.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = W ? b.join(process.env.APP_ROOT, "public") : G;
let y, P = null;
function Y() {
  y = new q({
    icon: b.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    autoHideMenuBar: !0,
    width: 1280,
    height: 1024,
    frame: !1,
    webPreferences: {
      preload: b.join(K, "preload.mjs"),
      webSecurity: !1
      // 禁用安全策略
    }
  }), y && fe(y), W ? y.loadURL(W) : y.loadFile(b.join(G, "index.html"));
  const e = T.getInstance();
  e.connectIfNeeded().then(() => {
    P = setInterval(() => {
      e.writeItems("DB7,X4.0", !0);
    }, 5e3);
  }).catch((t) => {
    I.showErrorBox("PLC Initialization failed.", "连接PLC失败请联系管理员");
  });
}
const pe = k.requestSingleInstanceLock();
pe ? k.on("second-instance", (e) => {
  y && (y.isMinimized() && y.restore(), y.focus());
}) : k.quit();
k.on("will-finish-launching", () => {
  x.existsSync("D:/JJSK_Data") || x.mkdirSync("D:/JJSK_Data"), k.setPath("appData", "D:/JJSK_Data");
});
k.on("before-quit", () => {
  P && clearInterval(P), T.getInstance().disconnect(), y == null || y.removeAllListeners("close"), $.unregisterAll(), y == null || y.close();
});
k.on("window-all-closed", () => {
  P && clearInterval(P), T.getInstance().disconnect(), process.platform !== "darwin" && (k.quit(), y = null);
});
k.on("activate", () => {
  q.getAllWindows().length === 0 && Y();
});
k.whenReady().then(Y);
export {
  Le as MAIN_DIST,
  G as RENDERER_DIST,
  W as VITE_DEV_SERVER_URL
};
