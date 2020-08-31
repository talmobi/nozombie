[![npm](https://img.shields.io/npm/v/nozombie.svg?maxAge=3600&style=flat-square)](https://www.npmjs.com/package/nozombie)
[![npm](https://img.shields.io/npm/l/nozombie.svg?maxAge=3600&style=flat-square)](https://github.com/talmobi/nozombie/blob/master/LICENSE)
![mac](https://github.com/talmobi/nozombie/workflows/mac/badge.svg)
![ubuntu](https://github.com/talmobi/nozombie/workflows/ubuntu/badge.svg)
![windows](https://github.com/talmobi/nozombie/workflows/windows/badge.svg)

#  nozombie
Easy pid tracking and killing. No more zombie processes left alive!

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
nz.add( child.pid ) // child (and descendants) ill be killed when parent (process.pid) dies
```

#### time to live
```javascript
const nozombie = require( 'nozombie' )
const nz = nozombie()

const spawn = childProcess.spawn( ... )
const FIVE_MINUTES_MS = 1000 * 60 * 5

// child will be killed when parent (process.pid) dies or 5 minutes have passed
nz.add( { pid: spawn.pid, ttl: FIVE_MINUTES_MS } )

// to update/refresh the ttl just add the same process pid again with a new ttl
nz.add( { pid: spawn.pid, ttl: FIVE_MINUTES_MS } ) // update ttl
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

Track child pid's and kill them off when parent process dies.

## Why

To help keep track of pid's that need to be killed off and not leave running for too long.

## For who?

For those wanting a simple way prevent zombies.

## How

By spawning a detached, stdio ignored, unref'ed subprocess to keep track of
pids.

Once it notices that a parent pid has died, it will go into a killing
rampage of children pid's.

If all children are killed or after ~15 seconds it will suicide. Regardless if some children pid's remain alive.

Killing attempts happen about every ~1second when a children is doomed to death. A children is doomed under the following circumstances:
	1. main parent process dies
	2. a named parent process dies with the same name as the children
	3. ttl expires
	4. nz.kill() is called
	5. nz.kill( name:string ) of children with that name is called

The subprocess reads the relevent pid's from a shared temporary file the main parent process creates before spawning the subprocess.
The subprocess will clean up this temporary file before it kills itself.

#### NOTE!
Killing children isn't guaranteed. When a child is doomed, it is usually killed within a few seconds.
If a child is not killed by its 10th attempt (within ~10-15 seconds), it will be considered immortal, ignored and removed silently.

## API
```javascript
const nozombie = require( 'nozombie' )

const nz = nozombie()
	// spawns (or returns already existing) detached subprocess api

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

// advanced usecase -- you probably don't need this
nozombie.spawn( { main_parent_pid: number } )
	// spawn a new subprocess api and set its main_parent_pid manually
	// main_parent_pid defaults to process.pid
```


## Similar
[tree-kill](https://www.npmjs.com/package/tree-kill)
[ps-list](https://www.npmjs.com/package/ps-list).

## Test
```
npm test
```
