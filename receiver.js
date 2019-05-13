'use strict';

module.exports = {
    spinUp
};

const PUBLIC_IP = require('./index.js').PUBLIC_IP,
    IDLE_LIFETIME_MS = require('./index.js').IDLE_LIFETIME_MS,
    SOCKET_SEND_OPTS = require('./index.js').SOCKET_SEND_OPTS;

function spinUp(lePath){
    var _ = require('lodash'),
        ws = require('ws'),
        prettyBytes = require('pretty-bytes'),
        generatePassword = require('generate-password'),
        url = require('url'),
        path = require('path'),
        http = require('http'),
        express = require('express'),
        fse = require('fs-extra'),
        ip = require('ip'),
        md5File = require('md5-file');

    var app, server, wsServer,
        listenerPort, listenerSecretKey,
        hearbeat, lastActionNow = _.now(),
        vipSocket, pathWhereToSave, shouldAppendFile,
        fileHashToCheck,
        commStage = 1, dataSize, dataSizeBar = 0, percentageBar = 0,
        fileBytesTmpBuffer = [], currentlyWritingBytes = false;

    function leStuff(){
        listenerPort = _.random(10000, 19999);
        listenerSecretKey = generatePassword.generate({ length: 48, numbers: true, uppercase: true, symbols: false });

        app = express();
        server = http.createServer(app).listen(listenerPort, PUBLIC_IP);

        server.on('error', err => {
            if(err.code === 'EADDRINUSE'){
                leStuff();
            } else {
                console.error(err);
                process.exit(-1);
            }
        });
        server.on('listening', () => {
            var myIp = ip.address();
            console.log();
            console.log(`\t ~ Listening IP-address: ${PUBLIC_IP} (${myIp})`);
            console.log(`\t ~ Listening port: ${listenerPort}`);
            console.log(`\t ~ Secret key: ${listenerSecretKey}`);
            console.log(`\t~~ Destination should look like: ${listenerSecretKey}@${myIp}:${listenerPort} (recheck IP-address)`);
            console.log();
            console.log(`(Use this data to send data here)`);
            console.log();
            console.log(`After end or ~${Math.floor(IDLE_LIFETIME_MS / 1000)} secs of idle it will close.`);

            hearbeat = setInterval(() => {
                if(_.now() - IDLE_LIFETIME_MS > lastActionNow){
                    console.log(`Closing app after ~${Math.floor((_.now() - lastActionNow) / 1000)} secs of idle`);
                    process.exit(0);
                }
            }, 1000);

            makeReceiver();
        });
    }
    function makeReceiver(){
        wsServer = new ws.Server({ server, backlog: 1, maxPayload: BRICK_SIZE * 2 });
        wsServer.on('connection', newConnectionListener);
        wsServer.on('error', console.error);
    }
    function newConnectionListener(socket, req){
        var reqParsed = url.parse(req.url, true),
            providedKey = reqParsed.query.key;
        shouldAppendFile = !!reqParsed.query.apf;

        if(vipSocket || providedKey !== listenerSecretKey){
            socket.terminate();
        } else {
            if(shouldAppendFile){
                console.log('New data will be appended!');
            }
            vipSocket = socket;
            gotVipSocket();
        }
    }
    function gotVipSocket(){
        wsServer.removeListener('connection', newConnectionListener);
        wsServer.removeAllListeners('error');

        vipSocket.on('message', socketMessageHandler);
        vipSocket.on('error', err => {
            console.error(err);
            console.log('Sender socket has some problems. Exiting...');
            process.exit(-1);
        });
        pathWhereToSave = path.isAbsolute(lePath) ? lePath : path.join(process.cwd(), lePath);
        workoutTargetFile();
    }
    function workoutTargetFile(){
        function doRemove(){
            let callbackFn = err => {
                if(err){
                    console.error(err);
                    process.exit(-1);
                } else {
                    doEnsure();
                }
            };

            fse.remove(pathWhereToSave, callbackFn);
        }
        function doEnsure(){
            let callbackFn = err => {
                if(err){
                    console.error(err);
                    process.exit(-1);
                } else {
                    vipSocket.send('ready:start', SOCKET_SEND_OPTS);
                }
            };

            fse.ensureFile(pathWhereToSave, callbackFn);
        }

        if(shouldAppendFile){
            doEnsure();
        } else {
            doRemove();
        }
    }
    function socketMessageHandler(data){
        lastActionNow = _.now();
        switch(commStage){
            case 1: handleDataSize(data); break;
            case 2:
                if(data.length || dataSizeBar + data.length > dataSize){
                    handleDataBytes(data);
                } else {
                    removeFile(4400, 'err:1');
                }
                break;
            case 3: informativeResponse(); break;
            default: removeFile(4400, 'err:2');
        }
    }
    function handleDataSize(data){
        try {
            data = JSON.parse(data);
        } catch(err) {
            return removeFile(4400, 'err:3');
        }
        if(data.ds){
            if(Number.isInteger(data.ds) && data.ds > 0){
                dataSize = data.ds;
                console.log(`Got data size(${prettyBytes(dataSize)})...`);
                commStage++;
                vipSocket.send('ready:bytes', SOCKET_SEND_OPTS);
            } else {
                removeFile(4400, 'err:4');
            }
        } else if(data.md5){
            fileHashToCheck = data.md5;
            console.log(`File MD5 is: ${fileHashToCheck}`);
        } else {
            return removeFile(4400, 'err:3');
        }
    }
    function handleDataBytes(data){
        if(data){
            if(!Buffer.isBuffer(data)){
                data = Buffer.from(data);
            }
            fileBytesTmpBuffer.push(data);
        }
        if(!currentlyWritingBytes){
            let theBufferedData;
            let callbackFn = err => {
                if(err){
                    console.error(err);
                    removeFile(4500, 'err:5');
                } else if(dataSizeBar + theBufferedData.length === dataSize){
                    tryToCheckFileHash();
                } else {
                    dataSizeBar += theBufferedData.length;
                    let pb = Math.floor(10 / (dataSize / dataSizeBar));
                    if(percentageBar !== pb){
                        percentageBar = pb;
                        vipSocket.send(`transfer:${percentageBar}0%`, SOCKET_SEND_OPTS);
                        console.log(`Transfer progress: ${percentageBar}0%`);
                    }
                    currentlyWritingBytes = false;
                    if(fileBytesTmpBuffer.length){
                        handleDataBytes();
                    }
                }
            };

            currentlyWritingBytes = true;
            theBufferedData = Buffer.concat(fileBytesTmpBuffer);
            fileBytesTmpBuffer = [];
            fse.appendFile(pathWhereToSave, theBufferedData, callbackFn);
        }
    }
    function tryToCheckFileHash(){
        if(fileHashToCheck){
            let callbackFn = (err, theHash) => {
                if(err){
                    console.error(err);
                    removeFile(4500, 'err:6');
                } else if(fileHashToCheck === theHash){
                    console.log('Files hash match!');
                    doneTransfer();
                } else {
                    console.error(`File hash is invalid(${theHash}, need: ${fileHashToCheck})!!!`);
                    removeFile(4400, 'err:7');
                }
            };

            md5File(pathWhereToSave, callbackFn);
        } else {
            doneTransfer();
        }
    }
    function doneTransfer(){
        console.log(`Transfer done. Goodbye!`);
        clearInterval(hearbeat);
        currentlyWritingBytes = false;
        vipSocket.removeEventListener('message', socketMessageHandler);
        vipSocket.send('transfer:finish', SOCKET_SEND_OPTS, err => process.exit(err ? -1 : 0));
    }
    function informativeResponse(){
        vipSocket.send('transfer:wait', SOCKET_SEND_OPTS);
    }
    function removeFile(code, message){
        clearInterval(hearbeat);
        vipSocket.send(message, SOCKET_SEND_OPTS, () => vipSocket.close(code));
        if(shouldAppendFile){
            process.exit(0);
        } else {
            let callbackFn = err => {
                if(err){
                    console.error(err);
                    process.exit(-1);
                } else {
                    process.exit(0);
                }
            };

            fse.remove(pathWhereToSave, callbackFn);
        }
    }

    leStuff();
}