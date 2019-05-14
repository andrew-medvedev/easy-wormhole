# Easy Wormhole

## A tool for easy transfer files and data between hosts

### `~ wormhole --help`

```
Usage: easyWormhole <receive or send> <path to file or "data"> <destination>

Commands:

receive		~ receive <path> : Listen on global address to receive data and save it into file on <path>. Port and secret key will be generated automatically. Use argument "-d" to daemonize receiver
send		~ send <path or "-- data"> <destination>: Send file or data. If file - first argument should path, if data - two minuses before (-- "data"). Destination should be in format: key@ip_address:port
```