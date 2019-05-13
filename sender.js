'use strict';

module.exports = {
    spinUp
};

const SOCKET_SEND_OPTS = require('./index.js').SOCKET_SEND_OPTS;

function spinUp(lePath, data, destination){
    var ws = require('ws'),
        prettyBytes = require('pretty-bytes'),
        path = require('path'),
        fse = require('fs-extra'),
        md5File = require('md5-file');

    var WebSocketStream = require('./utils.js').websocketStream;

    var secretKey, targetHost, targetPort,
        leSocket,
        targetFilePath;

    function parseDestination() {
        var _prs1 = destination.split('@'),
            _prs2 = _prs1[1].split(':');
        secretKey = _prs1[0];
        [targetHost, targetPort] = _prs2;

        targetFilePath = path.isAbsolute(lePath) ? lePath : path.join(process.cwd(), lePath);
        console.log(`Connecting to ${targetHost}:${targetPort} with secret key "${secretKey.slice(0, 10)}... etc"`);
        makeWsConnection();
    }
    function makeWsConnection(){
        leSocket = new ws(`ws://${targetHost}:${targetPort}?key=${secretKey}${lePath ? '' : `&apf=1`}`);

        leSocket.on('error', err => {
            console.error(err);
            process.exit(-1);
        });
        leSocket.on('open', () => console.log(`Connection established`));
        leSocket.on('message', handleWsMessage);
        leSocket.on('close', code => console.log(`Connection closed with code ${code}.`));
    }
    function handleWsMessage(data){
        if(data === 'ready:start'){
            firstlyWeWillCheckMd5OfFile();
        } else if(data === 'ready:bytes'){
            sendDataBytes();
        } else if(data.startsWith('err:')){
            console.error(`Unexpected error while sending:`);
            switch(data.split(':')[1]){
                case '1': console.error('Invalid sended data size (empty or overflowed).'); break;
                case '2': console.error('Invalid communication stage'); break;
                case '3': console.error('Invalid data size message'); break;
                case '4': console.error('Invalid data size itself'); break;
                case '5': console.error('Error while writing file'); break;
                case '6': console.error('Error while getting file md5'); break;
                case '7': console.error('Files hashes turned up different!'); break;
            }
            process.exit(-1);
        } else if(data.startsWith('transfer:')){
            if(data === 'transfer:finish'){
                console.log('Transfer is done. And receiver is okay. Goodbye!');
                process.exit(0);
            } else if(data === 'transfer:wait'){
                console.log('Transfer...');
            } else {
                console.log(`Transfer progress: ${data.split(':')[1]}`);
            }
        }
    }
    function firstlyWeWillCheckMd5OfFile(){
        if(targetFilePath){
            let callbackFn = (err, theHash) => {
                if(err){
                    console.error(err);
                    process.exit(-1);
                } else {
                    console.log(`File MD5 is: ${theHash}`);
                    leSocket.send(JSON.stringify({ md5: theHash }), SOCKET_SEND_OPTS, sendDataSize);
                }
            };

            md5File(targetFilePath, callbackFn);
        } else {
            sendDataSize();
        }
    }
    function sendDataSize(){
        if(data){
            let leSize = Buffer.byteLength(data, 'utf8');
            console.log(`Sending data size(${prettyBytes(leSize)})...`);
            leSocket.send(JSON.stringify({ ds: leSize }));
        } else {
            let callbackFn = (err, stats) => {
                if(err){
                    console.error(err);
                    process.exit(-1);
                } else if(!stats.isFile()){
                    console.error('It\'s not a file!');
                    process.exit(-1);
                } else {
                    console.log(`Sending data size(${prettyBytes(stats.size)})...`);
                    leSocket.send(JSON.stringify({ ds: stats.size }));
                }
            };

            fse.lstat(targetFilePath, callbackFn);
        }
    }
    function sendDataBytes(){
        let callbackFn = err => {
            if(err){
                console.error(err);
                process.exit(-1);
            } else {
                console.log('Transfer is done.')
            }
        };

        if(targetFilePath){
            let leStream = fse.createReadStream(targetFilePath).pipe(WebSocketStream(leSocket, { binary: true }));
            leStream.on('error', callbackFn);
            leStream.on('finish', callbackFn);
        } else {
            leSocket.send(data, SOCKET_SEND_OPTS, callbackFn);
        }
    }

    parseDestination();
}