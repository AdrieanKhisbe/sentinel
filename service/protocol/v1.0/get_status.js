"use strict"

var _ = require( 'lodash' )
var uuid = require( 'node-uuid' )
var async = require( 'async' )


module.exports = function( options ) {
  var seneca = this;

  var entities = seneca.export( 'constants/entities' )
  var mite_status = seneca.export( 'constants/mite_status' )

  var hist_data = {
    'load_1': true,
    'load_5': true,
    'load_15': true,
    'used_memory': true
  }

  function get_status( args, done ) {
    var mite = args.mite
    var communication_context = args.communication_context

    done( null, {
      authorization: {
        token: communication_context.auth_token
      },
      command: {
        type: 'getStatus'
      },
      payload: {
      }
    } )
  }


  function response_get_status( args, done ) {
    var response = args.response
    var mite = args.mite

    if( response.err ) {
      return done( null, { response: response, mite: mite } )
    }
    if( response.execution.err ) {
      return done( null, { err: true, code: response.execution.code, message: response.execution.msg} )
    }

    if( response.payload ) {
      mite.last_connect_time = new Date()

      mite.web_api = process_web_stats( response.payload.web_stats )

      saveSenecaStatus( response.payload.seneca_stats )
      async.eachLimit( response.payload.os, 10, saveOSStatus, function() {
      } )

      seneca.act( "role:'documentation', update:'data'", {mite_id: mite.id, web_api: mite.web_api} )
    }

    done( null, { response: response, mite: mite } )


    function saveSenecaStatus( status ) {
      if( !status ) {
        return
      }
      status.mite_id = mite.id
      entities.getEntity( 'seneca_status', seneca ).load$( {mite_id: mite.id}, function( err, db ) {
        if( err ) {
          return
        }
        if( !db ) {
          db = entities.getEntity( 'seneca_status', seneca )
        }
        db = _.extend( db, status )

        db.save$()
      } )
    }


    function saveOSStatus( status, done ) {
      status.mite_id = mite.id
      entities.getEntity( 'os_status', seneca, status ).save$( function() {
        if( status.data ) {
          for( var i in status.data ) {
            status.data[i].mite_id = mite.id
            status.data[i].date = new Date( status.date )
            if( hist_data[status.data[i].data_type] ) {
              entities.getEntity( 'os_status_instant', seneca, status.data[i] ).save$()
            }
            processAlarm( status.data[i] )
          }
        }
        done()
      } )
    }
  }

  function processAlarm( data ) {
    if( 'application_restarted' === data.data_type ) {
      seneca.act( "role: 'alarm', notify:'data'", { mite_id: data.mite_id, data: data} )
      return
    }
    if( 'memory_usage' === data.data_type ) {
      seneca.act( "role: 'alarm', notify:'data'", { mite_id: data.mite_id, data: data} )
      return
    }
  }


  function process_web_stats( web_stats ) {
    var stats = {
      data: []
    }
    if( !web_stats ) {
      // no data received, ignore this
      return stats
    }

//    stats.date = web_stats
    delete web_stats.date

    for( var key in web_stats ) {
      var data = key.split( ';' )
      var obj = {
        method: data[1],
        url: data[2],
        id: uuid()
      }
      obj = _.extend( obj, web_stats[key] )
      stats.data.push( obj )
    }

    return stats
  }


  seneca
    .add( {role: 'protocol_v1', generate: 'get_status'}, get_status )
    .add( {role: 'protocol_v1', process_response: 'get_status'}, response_get_status )
}