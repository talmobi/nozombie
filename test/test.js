const test = require( 'tape' )
const nozombie = require( '../src/main.js' )

const fs = require( 'fs' )
const path = require( 'path' )

const childProcess = require( 'child_process' )

function spawn ( name, ms, buffer ) {
	const cmd = process.env._
	const args = [
		path.join( __dirname, 'mocks/spawn-name.js' ),
		name,
		ms
	]
	const child = childProcess.spawn( cmd, args )

	if ( buffer ) {
		child.stdout.on( 'data', function ( chunk ) {
			buffer.push( chunk.toString() )
		} )
	}

	return child
}

async function wait ( ms ) {
	return new Promise( function ( resolve ) {
		setTimeout( resolve, ms )
	} )
}

test( 'basic usage', async function ( t ) {
	t.timeoutAfter( 1000 * 15 )

	const nz = nozombie()
	nz.spawn.on( 'exit', function () {
		t.plan( 7 )
		t.pass( 'nozombie exited OK' )
	} )

	const buffer = []
	const parentProcess = spawn( 'parent', 1000 * 5, buffer )
	const childProcess1 = spawn( 'child1', 1000 * 2, buffer )
	const childProcess2 = spawn( 'child2', 1000 * 5, buffer )

	nz.addParent( parentProcess.pid )
	nz.addChild( childProcess1.pid )
	nz.addChild( childProcess2.pid )

	childProcess1.on( 'exit', function () {
		buffer.push( 'child1 exit' )
	} )
	childProcess2.on( 'exit', function () {
		buffer.push( 'child2 exit' )
	} )
	parentProcess.on( 'exit', function () {
		buffer.push( 'parent exit' )
	} )

	await wait( 1500 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: parent, timeout: 5000',
			'type: init, name: child1, timeout: 2000',
			'type: init, name: child2, timeout: 5000',
		].sort(),
		'all spawns init OK'
	)

	await wait( 1500 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: parent, timeout: 5000',
			'type: init, name: child1, timeout: 2000',
			'type: init, name: child2, timeout: 5000',
			'type: done, name: child1',
			'child1 exit',
		].sort(),
		'child1 completed OK'
	)

	// kill parent
	process.kill( parentProcess.pid, 'SIGKILL' )

	await wait( 3000 )

	t.ok(
		buffer.find( txt => txt === 'parent exit' ),
		'parent exited OK'
	)

	t.ok(
		!buffer.find( txt => txt === 'type: done, name:child 2' ),
		'child2 did not complete OK'
	)

	t.ok(
		buffer.find( txt => txt === 'child2 exit' ),
		'child2 exited OK'
	)

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: parent, timeout: 5000',
			'type: init, name: child1, timeout: 2000',
			'type: init, name: child2, timeout: 5000',
			'type: done, name: child1',
			'child1 exit',
			'parent exit',

			// child2 should not have time to complete because the parent
			// process, and thus the child, should have been killed
			'child2 exit',
		].sort(),
		'parent + child2 killed before completing OK'
	)
} )
