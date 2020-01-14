[![npm](https://img.shields.io/npm/v/nozombie.svg?maxAge=3600&style=flat-square)](https://www.npmjs.com/package/nozombie)
[![npm](https://img.shields.io/npm/l/nozombie.svg?maxAge=3600&style=flat-square)](https://github.com/talmobi/nozombie/blob/master/LICENSE)

#  nozombie
simple pid collection and [tree-kill](https://www.npmjs.com/package/tree-kill) based cleanup helper module.

## Easy to use

#### child_process
```javascript
const nz = require( 'nozombie' )()

const spawn = childProcess.spawn( ... )

// optional minimum time to live until killed by force
const ttl = 1000 * 60 * 5 // 5 min

nz.add( spawn.pid, ttl )

// ...

nz.kill( [function ( err, list_of_pids_killed ) {}] )
```

### puppeteer
```javascript
const browser = await puppeteer.launch( opts )
const child = browser.process()
const pid = child.pid

// optional minimum time to live until killed by force
const ttl = 1000 * 60 * 5 // 5 min

nz.add( pid, ttl )

// ...

nz.kill( [function ( err, list_of_pids_killed ) {}] )
```

## About

Collect and keep track of pid's and kill them off.

## API
```javascript
// add pid to list
nz.add( pid )

// optional maximum ttl ( milliseconds ) before killed
nz.add( pid, ttl )

// get (copy) of pids list
var list = nz.list()

// kill pids
nz.kill( [function ( err, list_of_pids_killed ) {}] )
```

## Why

To help keep track of pid's that need to be killed off and not leave running. And to reduce boilerplate for doing.

## For who?

For those who have trouble with zombie processes or have trouble keeping track of them or want to reduce/simplify the process.

## How

Using [tree-kill](https://www.npmjs.com/package/tree-kill)  and a simple module API.

## Alternatives
[tree-kill](https://www.npmjs.com/package/tree-kill)

## Test
```
npm test
```
