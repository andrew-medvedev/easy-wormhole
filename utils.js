'use strict';

var Transform = require('readable-stream').Transform,
    duplexify = require('duplexify'),
    WS = require('ws'),
    Buffer = require('safe-buffer').Buffer;

module.exports = {
    websocketStream
};

function buildProxy(options, socketWrite, socketEnd){
    var proxy = new Transform({ objectMode: options.objectMode });

    proxy._write = socketWrite;
    proxy._flush = socketEnd;

    return proxy;
}

function websocketStream(target, protocols, options){
    var stream, socket;

    var isBrowser = process.title === 'browser',
        isNative = !!global.WebSocket,
        socketWrite = isBrowser ? socketWriteBrowser : socketWriteNode;

    if(protocols && !Array.isArray(protocols) && typeof protocols === 'object'){
        options = protocols;
        protocols = null;

        if (typeof options.protocol === 'string' || Array.isArray(options.protocol)) {
            protocols = options.protocol;
        }
    }

    if (!options) options = {};

    if (options.objectMode === undefined) {
        options.objectMode = !(options.binary === true || options.binary === undefined)
    }

    var proxy = buildProxy(options, socketWrite, socketEnd);

    if (!options.objectMode) {
        proxy._writev = writev
    }

    var bufferSize = options.browserBufferSize || 1024 * 512,
        bufferTimeout = options.browserBufferTimeout || 1000;

    if (typeof target === 'object') {
        socket = target
    } else {
        if (isNative && isBrowser) {
            socket = new WS(target, protocols)
        } else {
            socket = new WS(target, protocols, options)
        }
        socket.binaryType = 'arraybuffer'
    }

    if (socket.readyState === socket.OPEN) {
        stream = proxy
    } else {
        stream = duplexify.obj();
        socket.once('open', onopen);
    }

    stream.socket = socket;

    socket.on('close', onclose);
    socket.on('error', onerror);

    proxy.on('close', destroy);

    var coerceToBuffer = !options.objectMode;

    function socketWriteNode(chunk, enc, next) {
        if (socket.readyState !== socket.OPEN) {
            next();
            return
        }

        if (coerceToBuffer && typeof chunk === 'string') {
            chunk = new Buffer(chunk, 'utf8')
        }
        socket.send(chunk, next);
    }
    function socketWriteBrowser(chunk, enc, next) {
        if (socket.bufferedAmount > bufferSize) {
            return setTimeout(socketWriteBrowser, bufferTimeout, chunk, enc, next);
        }

        if (coerceToBuffer && typeof chunk === 'string') {
            chunk = new Buffer(chunk, 'utf8')
        }

        try {
            socket.send(chunk);
        } catch (err) {
            return next(err)
        }

        next()
    }
    function socketEnd(done) {
        socket.removeListener('close', onclose);
        socket.removeListener('error', onerror);
        done()
    }
    function onopen() {
        stream.setReadable(proxy);
        stream.setWritable(proxy);
        stream.emit('connect')
    }
    function onclose() {
        stream.end();
        stream.destroy()
    }
    function onerror(err) {
        stream.destroy(err)
    }
    function destroy() {
        socket.close();
    }
    function writev (chunks, cb) {
        var buffers = new Array(chunks.length);
        for (var i = 0; i < chunks.length; i++) {
            if (typeof chunks[i].chunk === 'string') {
                buffers[i] = Buffer.from(chunks[i], 'utf8')
            } else {
                buffers[i] = chunks[i].chunk
            }
        }

        this._write(Buffer.concat(buffers), 'binary', cb)
    }

    return stream
}