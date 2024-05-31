'use strict';

const { showSnackBar } = require("./snackbar");

function handleRemoteParticipantReconnectionUpdates(room) {
  room.on('participantReconnecting', function(participant) {
    showSnackBar(participant.identity + ": " + participant.state);
  });

  room.on('participantReconnected', function(participant) {
    showSnackBar(participant.identity + ": " + participant.state);
  });
}

function handleLocalParticipantReconnectionUpdates(room) {
  const localParticipant = room.localParticipant;

  localParticipant.on('reconnecting', function() {
    showSnackBar(localParticipant.identity + ": " + localParticipant.state);
  });

  localParticipant.on('reconnected', function() {
    showSnackBar(localParticipant.identity + ": " + localParticipant.state);
  });
} 

exports.handleLocalParticipantReconnectionUpdates = handleLocalParticipantReconnectionUpdates;
exports.handleRemoteParticipantReconnectionUpdates = handleRemoteParticipantReconnectionUpdates;