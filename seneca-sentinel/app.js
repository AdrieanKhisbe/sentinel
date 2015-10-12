"use strict";

var http = require( 'http' )

var express = require( 'express' )
var bodyParser = require( 'body-parser' )
var cookieParser = require( 'cookie-parser' )
var methodOverride = require( 'method-override' )
var session = require( 'express-session' )
var serveStatic = require( 'serve-static' )
var async = require( 'async' )
var path = require( 'path' )
var fs = require( 'fs' )

// create a seneca instance
var seneca = require( 'seneca' )({log: console})

var options = seneca.options( 'config.mine.js' )
seneca.use( 'mongo-store', options.db );

seneca.use( 'user' )

seneca.use( 'auth', options.auth )

seneca.use( 'seneca-mail', options.mail )

var app = express()
app.enable( 'trust proxy' )

app.use( cookieParser() )
app.use( express.query() )
app.use( bodyParser.urlencoded( {extended: true} ) )
app.use( methodOverride() )
app.use( bodyParser.json() )

app.use( session( {secret: 'seneca'} ) )

app.use( serveStatic( __dirname + '/public' ) )

app.use( seneca.export( 'web' ) )

function loadDBInstance() {
  var ent = seneca.make$( {name$: 'seneca'} )

  ent.native$( function( err, dbinst ) {
    if( err ) {
      console.log( 'Cannot connect to db, wait...' )
      setTimeout( loadDBInstance, 5 * 1000 )
      return
    }

    loadModules()
  } )
}
loadDBInstance()


function loadModules() {
  processInjectedFolders( ['constants', 'controller', 'service'], function() {
    var server = http.createServer( app )
    server.listen( options.main ? options.main.port : 3000 )

    var u = seneca.pin( {role: 'user', cmd: '*'} )
    u.register( { nick: 'malex@gmail.com', name: 'Admin Account', email: 'malex@gmail.com', password: 'admin', active: true } )

  } )
}

function processInjectedFolders( folders, done ) {
  console.log( JSON.stringify( folders ) )

  async.waterfall( [
    function( done ) {
      var paths = []
      async.eachSeries( folders, function( item, callback ) {
        var folder = path.resolve( __dirname, item )
        paths.push( folder )
        callback()
      }, function( err ) {
        if( err ) {
          return done( err )
        }
        return done( null, paths )
      } )
    },
    function( paths, done ) {
      var files = [];
      async.eachSeries( paths, function( path, callback ) {
        console.log( 'Processing folder %s', path )
        walkdir( path, function( err, fileList ) {
          console.log( 'walkdir files: %s', fileList )
          if( err ) {
            console.error( err )
            return callback()
          }
          else {
            for( var f = 0; f < fileList.length; f++ ) {
              files.push( fileList[f] );
            }
            return callback()
          }
        } )
      }, function( err ) {
        if( err ) {
          return done( err )
        }
        return done( null, files )
      } )
    },
    function( files, done ) {
      async.eachSeries( files, function( file, callback ) {
        console.log( '##############################################################################' )
        console.log( 'Injecting file: %s', file )
        seneca.use( file );
        callback()
      }, function( err ) {
        if( err ) {
          return done( err )
        }
        return done();
      } )
    }],
    function( err, result ) {
      console.log( 'Finished modules injection' )
      done( err, result );
    } )
}

function walkdir( dir, done ) {
  var results = [];
  fs.readdir( dir, function( err, list ) {
    if( err ) {
      return done( err );
    }
    var pending = list.length;
    if( !pending ) {
      return done( null, results );
    }
    list.forEach( function( file ) {
      file = dir + '/' + file;
      fs.stat( file, function( err, stat ) {
        if( stat && stat.isDirectory() ) {
          walkdir( file, function( err, res ) {
            results = results.concat( res );
            if( !--pending ) {
              done( null, results );
            }
          } );
        }
        else {
          results.push( file );
          if( !--pending ) {
            done( null, results );
          }
        }
      } );
    } );
  } );
};
