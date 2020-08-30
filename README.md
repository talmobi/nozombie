[![npm](https://img.shields.io/npm/v/nozombie.svg?maxAge=3600&style=flat-square)](https://www.npmjs.com/package/nozombie)
[![npm](https://img.shields.io/npm/l/nozombie.svg?maxAge=3600&style=flat-square)](https://github.com/talmobi/nozombie/blob/master/LICENSE)

#  nozombie
simple pid tracking and killing

## Easy to use

#### child_process
```javascript
const nozombie = require( 'nozombie' )
const nz = nozombie()

const spawn = childProcess.spawn( ... )
nz.add( spawn.pid ) // child will be killed when parent (process.pid) dies
```

#### puppeteer
```javascript
const nozombie = require( 'nozombie' )
const nz = nozombie()

const browser = await puppeteer.launch( opts )
const child = browser.process()
nz.add( child.pid ) // child will be killed when parent (process.pid) dies
```

#### time to live
```javascript
const nozombie = require( 'nozombie' )
const nz = nozombie()

const spawn = childProcess.spawn( ... )
const FIVE_MINUTES_MS = 1000 * 60 * 5

// child will be killed when parent (process.pid) dies or 5 minutes have passed
nz.add( spawn.pid, FIVE_MINUTES_MS )

// to update the ttl just add the process pid again with a new ttl
nz.add( spawn.pid, FIVE_MINUTES_MS ) // update ttl
```

#### namespace
```javascript
const nozombie = require( 'nozombie' )
const nz = nozombie()

const SCRAPE_INTERVAL = 1000 * 60 * 3

setTimeout( scapeData, 0 )
function scapeData () {
	const browser = await puppeteer.launch( opts )
	const child = browser.process()

	const namespace = 'scrape-data'

	// kill all children with this namespace
	nz.kill( namespace )

	// won't be killed as it was added after the kill call
	nz.add( { pid: child.pid, name: namespace } )

	// do something
	setTimeout( scapeData, SCRAPE_INTERVAL )
}
```

## About

Collect and keep track of pid's and kill them off when parent dies or by ttl or
by ordering them to die by name ( nz.kill( 'name' ) or kill all ( nz.kill() )

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
process creates before spawning the subprocess. The subprocess will clean up this
temporary file before it kills itself.

## API
```javascript
const nozombie = require( 'nozombie' )

const nz = nozombie()
	// spawns/gets the detached subprocess

nz.add( pid )
	// pid: number
	// add pid to be killed when parent process dies

nz.add( opts )
	// opts.pid: number
	// opts.name: string (optional)
	// opts.ttl: number (optional)
	// add pid that will be killed when the ttl expires or can be manually
	// killed by its name

nz.kill()
	// kill all children that were added up until this point (order of add/kill matters)

nz.kill( name )
	// name: string
	// kill all children that match this name up until this point (order of add/kill matters)
```


## Similar
[tree-kill](https://www.npmjs.com/package/tree-kill)
[ps-list](https://www.npmjs.com/package/ps-list).

## Test
```
npm test
```
