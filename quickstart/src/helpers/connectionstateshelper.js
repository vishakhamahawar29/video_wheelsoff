'use strict';
const { showSnackBar } = require('./snackbar');

/**
 * Listen to Room reconnection events and update the UI accordingly.
 * @param {Room} room - The Room you have joined
 * @param {function} updateRoomState - Updates the app UI with the new Room state
 * @returns {void}
 */
function setupReconnectionUpdates(room) {

  room.on('reconnected', function() {
    console.log('Reconnected to the Room!');
    showSnackBar(room.state);
  });

  room.on('reconnecting', function(error) {
    if (error.code === 53001) {
      console.log('Reconnecting your signaling connection!', error.message);
      showSnackBar('Reconnecting your signaling connection!');
    } else if (error.code === 53405) {
      console.log('Reconnecting your media connection!', error.message);
      showSnackBar('Reconnecting your media connection!');
    }
    showSnackBar(room.state);
  });
}

exports.setupReconnectionUpdates = setupReconnectionUpdates;