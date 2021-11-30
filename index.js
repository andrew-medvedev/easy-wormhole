'use strict';

const PUBLIC_IP = '0.0.0.0',
    IDLE_LIFETIME_MS = 60 * 1000 * 5,
    SOCKET_SEND_OPTS = { compress: false, mask: false, fin: true },
    IP_ADDRESS_REGEX = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;

module.exports = {
    PUBLIC_IP,
    IDLE_LIFETIME_MS,
    SOCKET_SEND_OPTS
};

(() => {
    if(process.argv.slice(2).includes('--help')){
        console.log();
        console.log('Usage: easyWormhole <receive or send> <path to file or "data"> <destination>');
        console.log();
        console.log('Commands:');
        console.log();
        console.log('\treceive\t\t~ receive <path> : Listen on global address to receive data and save it into file on <path>. Port and secret key will be generated automatically. Use argument "-d" to daemonize receiver');
        console.log('\tsend\t\t~ send <path or "-- data"> <destination>: Send file or data. If file - first argument should path, if data - two minuses before (-- "data"). Destination should be in format: key@ip_address:port');
        console.log();
    } else if(process.argv.slice(2).includes('--ver')){
        console.log(`Node version: ${process.version} ; EasyWormhole version: ${require('./package.json').version}`);
    } else {
        let args = [];
        for(let i = 0 ; i < process.argv.length ; i++){
            if(process.argv[i] === 'receive' || process.argv[i] === 'send'){
                args = process.argv.slice(i);
                break;
            }
        }
        switch(args[0]){
            case 'receive':
                if(args[1]){
                    let ipAddress;
                    if(args.length > 2){
                        ipAddress = args.find(e => IP_ADDRESS_REGEX.test(e));
                    }
                    return require('./receiver.js').spinUp(args[1], args.includes('-d'), ipAddress);
                }
                break;
            case 'send':
                if(args.length === 3){
                    return require('./sender.js').spinUp(args[1], null, args[2]);
                } else if(args.length === 4 && args[1] === '--'){
                    return require('./sender.js').spinUp(null, args[2], args[3]);
                }
                break;
        }
        console.log('\tUnknown command or wrong arguments. Type "--help" to see how to use');
        console.log();
        process.exit(-1);
    }
})();