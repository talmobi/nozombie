[![npm](https://img.shields.io/npm/v/nozombie.svg?maxAge=3600&style=flat-square)](https://www.npmjs.com/package/nozombie)
[![npm](https://img.shields.io/npm/l/nozombie.svg?maxAge=3600&style=flat-square)](https://github.com/talmobi/nozombie/blob/master/LICENSE)

#  nozombie
simple pid collection and [tree-kill](https://www.npmjs.com/package/tree-kill) based cleanup helper module.

## Easy to use

#### child_process
```javascript
const nozombie = require( 'nozombie' )
const spawn = childProcess.spawn( ... )
nz.add( spawn.pid ) // child will be killed when process.pid dies
```

#### puppeteer
```javascript
const browser = await puppeteer.launch( opts )
const child = browser.process()
nz.add( child.pid )
```

#### time to live
```javascript
const nozombie = require( 'nozombie' )
const spawn = childProcess.spawn( ... )
const FIVE_MINUTES_MS = 1000 * 60 * 5

// child will be killed when process.pid dies or 5 minutes have passed
nz.add( spawn.pid, 1000 * 60 * 5 )

// to update the ttl just add the process pid again with a new ttl
nz.add( spawn.pid, 1000 * 60 * 5 ) // update ttl
```

#### add another parent
Add more parent pids. When ANY of the parent pids dies, all children will be
killed. A pid can be a parent and a child at the same time.

The list of parents by default includes only `process.pid`.

```javascript
const parent = childProcess.spawn( ... )
const child1 = childProcess.spawn( ... )
const child2 = childProcess.spawn( ... )

nz.addParent( parent.pid )
nz.addChild( child1.pid )
nz.addChild( child2.pid )

parent.kill() // this will kill all children
```

## About

Collect and keep track of pid's and kill them off when any parent pid dies.

## Why

To help keep track of pid's that need to be killed off and not leave running.

## For who?

For those wanting a simple way prevent zombies.

## How

By spawning a detached, stdio ignored, unref'ed subprocess to keep track of
pids. Once it notices that a parent pid has died, it will go into a killing
rampage of children pid's and then after ~5 seconds it will kill itself
(regardless if children pid's are still alive or not)

The subprocess reads the relevent pid's from a shared temporary file the calling
process creates before spawning the subprocess. The subprocess will remove this
temporary file before it kills itself.

## Similar
[tree-kill](https://www.npmjs.com/package/tree-kill)
[ps-list](https://www.npmjs.com/package/ps-list).

## Test
```
npm test
```
