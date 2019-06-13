const args = process.argv

const timeout = Number( args[ 2 ] )

console.log( `timeout set to ${ timeout } milliseconds.` )
setTimeout( function () {
  console.log( 'done.' )
}, timeout )
