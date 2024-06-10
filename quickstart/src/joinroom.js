'use strict';


const { connect, createLocalVideoTrack, Logger  } = require('twilio-video');
const { isMobile } = require('./browser');

const $leave = $('#leave-room');
const $room = $('#room');
const $activeParticipant = $('div#active-participant > div.participant.main', $room);
const $activeVideo = $('video', $activeParticipant);
const $participants = $('div#participants', $room);
const { muteYourAudio, unmuteYourAudio, muteYourVideo, unmuteYourVideo } = require('./helpers/localMediahelpers');
var Snapshothelpers = require('./helpers/Snapshothelpers.js');
var displayLocalVideo = Snapshothelpers.displayLocalVideo;
var takeLocalVideoSnapshot = Snapshothelpers.takeLocalVideoSnapshot;
var canvas = document.querySelector('.snapshot-canvas');
var img = document.querySelector('.snapshot-img');
var takeSnapshot = document.querySelector('button#takesnapshot');
var video = document.querySelector('video#video_main');
const popupContainer = document.getElementById('popup-container');
const closePopupButton = document.getElementById('close-popup');
const helpers = require('./helpers/Screensharehelpers');
const createScreenTrack = helpers.createScreenTrack;
const captureScreen = document.querySelector('button#capturescreen');
const screenPreview = document.querySelector('video#screenpreview');
const stopScreenCapture = document.querySelector('button#stopscreencapture');
const { setupReconnectionUpdates } = require('./helpers/connectionstateshelper')
const { handleLocalParticipantReconnectionUpdates, handleRemoteParticipantReconnectionUpdates } = require('./helpers/rpcstatushelper');
const { showSnackBar } = require('./helpers/snackbar');




let $container;

// The current active Participant in the Room.
let activeParticipant = null;

// Whether the user has selected the active Participant by clicking on
// one of the video thumbnails.
let isActiveParticipantPinned = false;

/**
 * Set the active Participant's video.
 * @param participant - the active Participant
 */


function setActiveParticipant(participant) {
  if (activeParticipant) {
    const $activeParticipant = $(`div#${activeParticipant.sid}`, $participants);
    $activeParticipant.removeClass('active');
    $activeParticipant.removeClass('pinned');

    // Detach any existing VideoTrack of the active Participant.
    const { track: activeTrack } = Array.from(activeParticipant.videoTracks.values())[0] || {};
    if (activeTrack) {
      activeTrack.detach($activeVideo.get(0));
      $activeVideo.css('opacity', '0');
    }
  }

  // Set the new active Participant.
  activeParticipant = participant;
  const { identity, sid } = participant;
  const $participant = $(`div#${sid}`, $participants);

  $participant.addClass('active');
  if (isActiveParticipantPinned) {
    $participant.addClass('pinned');
  }

  // Attach the new active Participant's video.
  const { track } = Array.from(participant.videoTracks.values())[0] || {};
  
  if (track) {
    track.attach($activeVideo.get(0));
    $activeVideo.css('opacity', '');
  
}

  // Set the new active Participant's identity
 
  $activeParticipant.attr('data-identity', identity);
}

/**
 * Set the current active Participant in the Room.
 * @param room - the Room which contains the current active Participant
 */
function setCurrentActiveParticipant(room) {
  const { dominantSpeaker, localParticipant } = room;
  setActiveParticipant(dominantSpeaker || localParticipant);
}

/**
 * Set up the Participant's media container.
 * @param participant - the Participant whose media container is to be set up
 * @param room - the Room that the Participant joined
 */
function setupParticipantContainer(participant, room) {
  const { identity, sid } = participant;

  // Add a container for the Participant's media.
  const $container = $(`<div class="participant" data-identity="${identity}" id="${sid}">
    <audio autoplay ${participant === room.localParticipant ? 'muted' : ''} style="opacity: 0"></audio>
    <video autoplay muted playsinline style="opacity: 0"></video>
  </div>`);

  // Toggle the pinning of the active Participant's video.
  $container.on('click', () => {
   
   if (activeParticipant === participant && isActiveParticipantPinned) {
      // Unpin the RemoteParticipant and update the current active Participant.
      setVideoPriority(participant, null);
      isActiveParticipantPinned = false;
      setCurrentActiveParticipant(room);
    } else {
      // Pin the RemoteParticipant as the active Participant.
      if (isActiveParticipantPinned) {
        setVideoPriority(activeParticipant, null);
      }
      setVideoPriority(participant, 'high');
      isActiveParticipantPinned = true;
      setActiveParticipant(participant);
    }
  });

  // Add the Participant's container to the DOM.
  $participants.append($container);
}

/**
 * Set the VideoTrack priority for the given RemoteParticipant. This has no
 * effect in Peer-to-Peer Rooms.
 * @param participant - the RemoteParticipant whose VideoTrack priority is to be set
 * @param priority - null | 'low' | 'standard' | 'high'
 */
function setVideoPriority(participant, priority) {
  
  participant.videoTracks.forEach(publication => {
    const track = publication.track;
    if (track && track.setPriority) {
      track.setPriority(priority);
    }
  });
}

/**
 * Attach a Track to the DOM.
 * @param track - the Track to attach
 * @param participant - the Participant which published the Track
 */
function attachTrack(track, participant) {
  // Attach the Participant's Track to the thumbnail.
  const $media = $(`div#${participant.sid} > ${track.kind}`, $participants);
  $media.css('opacity', '');
  track.attach($media.get(0));

  // If the attached Track is a VideoTrack that is published by the active
  // Participant, then attach it to the main video as well.
 
  if (track.kind === 'video' && participant === activeParticipant) {
    track.attach($activeVideo.get(0));
    $activeVideo.css('opacity', '');
  }

}

/**
 * Detach a Track from the DOM.
 * @param track - the Track to be detached
 * @param participant - the Participant that is publishing the Track
 */
function detachTrack(track, participant) {
  // Detach the Participant's Track from the thumbnail.
  const $media = $(`div#${participant.sid} > ${track.kind}`, $participants);
  const mediaEl = $media.get(0);
  $media.css('opacity', '0');
  track.detach(mediaEl);
  mediaEl.srcObject = null;

  // If the detached Track is a VideoTrack that is published by the active
  // Participant, then detach it from the main video as well.
  if (track.kind === 'video' && participant === activeParticipant) {
    const activeVideoEl = $activeVideo.get(0);
    track.detach(activeVideoEl);
    activeVideoEl.srcObject = null;
    $activeVideo.css('opacity', '0');
  }
}

/**
 * Handle the Participant's media.
 * @param participant - the Participant
 * @param room - the Room that the Participant joined
 */
function participantConnected(participant, room) {
  // Set up the Participant's media container.
  setupParticipantContainer(participant, room);

  // Handle the TrackPublications already published by the Participant.
  participant.tracks.forEach(publication => {
    trackPublished(publication, participant);
  });

  // Handle theTrackPublications that will be published by the Participant later.
  participant.on('trackPublished', publication => {
    trackPublished(publication, participant);
  });
}

/**
 * Handle a disconnected Participant.
 * @param participant - the disconnected Participant
 * @param room - the Room that the Participant disconnected from
 */
function participantDisconnected(participant, room) {
  // If the disconnected Participant was pinned as the active Participant, then
  // unpin it so that the active Participant can be updated.
  if (activeParticipant === participant && isActiveParticipantPinned) {
    isActiveParticipantPinned = false;
    setCurrentActiveParticipant(room);
  }

  // Remove the Participant's media container.
  $(`div#${participant.sid}`, $participants).remove();
}

/**
 * Handle to the TrackPublication's media.
 * @param publication - the TrackPublication
 * @param participant - the publishing Participant
 */
function trackPublished(publication, participant) {
  // If the TrackPublication is already subscribed to, then attach the Track to the DOM.
  if (publication.track) {
    attachTrack(publication.track, participant);
  }

  // Once the TrackPublication is subscribed to, attach the Track to the DOM.
  publication.on('subscribed', track => {
    attachTrack(track, participant);
  });

  // Once the TrackPublication is unsubscribed from, detach the Track from the DOM.
  publication.on('unsubscribed', track => {
    detachTrack(track, participant);
  });
}

/**
 * Join a Room.
 * @param token - the AccessToken used to join a Room
 * @param connectOptions - the ConnectOptions used to join a Room
   */
 let videoProcessor;
 let localVideoTrack;


async function joinRoom(token, ConnectOption) 
{
  // Comment the next two lines to disable verbose logging.
  const logger = Logger.getLogger('twilio-video');
  logger.setLevel('debug');

  // Join to the Room with the given AccessToken and ConnectOptions.
  const room = await connect(token, ConnectOption);
  
  // Add event listeners to each option
  videoProcessor = null; 
  localVideoTrack = Array.from(room.localParticipant.videoTracks.values())[0].track;

  function handleOptionSelection() {
  var dropdown = document.getElementById("myDropdown");
  var selectedOptionValue = dropdown.value;
  var selectedOptionId = dropdown.options[dropdown.selectedIndex].id;

  console.log("Selected option value:", selectedOptionValue);
  console.log("Selected option ID:", selectedOptionId);

  // Call your desired function based on the selected option ID
  if (selectedOptionId == "option1") {
    if (videoProcessor) {
      localVideoTrack.removeProcessor(videoProcessor);
      videoProcessor = null;
    }
  
    console.log("Function for Option 1");
  } else if (selectedOptionId == "option2") {
    if (videoProcessor) {
      localVideoTrack.removeProcessor(videoProcessor);
      videoProcessor = null;
    }
    videoProcessor = {
      processFrame: (inputFrame, outputFrame) => {
        const ctx = outputFrame.getContext('2d');
        ctx.filter = 'grayscale(100%)';
        ctx.drawImage(inputFrame, 0, 0);
      }
          };
      localVideoTrack.addProcessor(videoProcessor);
    console.log("Function for Option 2");
  } else if (selectedOptionId == "option3") {
    if (videoProcessor) {
      localVideoTrack.removeProcessor(videoProcessor);
      videoProcessor = null;
    }
    videoProcessor = {
      processFrame: (inputFrame, outputFrame) => {
        const ctx = outputFrame.getContext('2d');
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(inputFrame, 0, 0, -inputFrame.width, inputFrame.height);
        ctx.restore();
      }
          };
      localVideoTrack.addProcessor(videoProcessor);
  
    console.log("Function for Option 3");
  }
  else if (selectedOptionId == "option4") {
    if (videoProcessor) {
      localVideoTrack.removeProcessor(videoProcessor);
      videoProcessor = null;
    }
    videoProcessor = {
      processFrame: (inputFrame, outputFrame) => {
        const ctx = outputFrame.getContext('2d');
        ctx.drawImage(inputFrame, 0, 0);

        ctx.font = '32px Arial';
        const text = 'Twilio';
        const sz = ctx.measureText(text);
        ctx.fillStyle = 'black';
        ctx.fillText('Twilio', 2 + outputFrame.width - sz.width - 10, 44);
        ctx.fillStyle = 'white';
        ctx.fillText('Twilio', outputFrame.width - sz.width - 10, 42);
      }
    }
  
    localVideoTrack.addProcessor(videoProcessor);
  }
  
  }
  document.getElementById("myDropdown").addEventListener("change", handleOptionSelection);

  // Make the Room available in the JavaScript console for debugging.
  window.room = room;

  // Handle the LocalParticipant's media.
  participantConnected(room.localParticipant, room);
  document.getElementById('message').innerHTML = 'Connected to Room : ' + room.name;

  setupReconnectionUpdates(room);

  handleRemoteParticipantReconnectionUpdates(room);
  handleLocalParticipantReconnectionUpdates(room);

  // Subscribe to the media published by RemoteParticipants already in the Room.
  room.participants.forEach(participant => {
    showSnackBar(participant.identity + ": " + participant.state);
    participantConnected(participant, room);
  });

  // Subscribe to the media published by RemoteParticipants joining the Room later.
  room.on('participantConnected', participant => {
    showSnackBar(participant.identity + ": " + participant.state);
    participantConnected(participant, room);
  });

  // Handle a disconnected RemoteParticipant.
  room.on('participantDisconnected', participant => {
    showSnackBar(participant.identity + ": " + participant.state);
    participantDisconnected(participant, room);
  });

  // Set the current active Participant.
  setCurrentActiveParticipant(room);

  // Update the active Participant when changed, only if the user has not
  // pinned any particular Participant as the active Participant.
  room.on('dominantSpeakerChanged', () => {
    if (!isActiveParticipantPinned) {
      setCurrentActiveParticipant(room);
    }
  });



  // Leave the Room when the "Leave Room" button is clicked.
  $leave.click(function onLeave() {
    $leave.off('click', onLeave);
    room.disconnect();
  });

  return new Promise((resolve, reject) => {
    // Leave the Room when the "beforeunload" event is fired.
    window.onbeforeunload = () => {
      room.disconnect();
    };

    if (isMobile) {
      // TODO(mmalavalli): investigate why "pagehide" is not working in iOS Safari.
      // In iOS Safari, "beforeunload" is not fired, so use "pagehide" instead.
      window.onpagehide = () => {
        room.disconnect();
      };

      // On mobile browsers, use "visibilitychange" event to determine when
      // the app is backgrounded or foregrounded.
      document.onvisibilitychange = async () => {
        if (document.visibilityState === 'hidden') {
          // When the app is backgrounded, your app can no longer capture
          // video frames. So, stop and unpublish the LocalVideoTrack.
          localVideoTrack.stop();
          room.localParticipant.unpublishTrack(localVideoTrack);
        } else {
          // When the app is foregrounded, your app can now continue to
          // capture video frames. So, publish a new LocalVideoTrack.
          localVideoTrack = await createLocalVideoTrack(connectOptions.video);
          await room.localParticipant.publishTrack(localVideoTrack);
        }
      };
    }

    room.once('disconnected', (room, error) => {
      // Clear the event handlers on document and window..
      window.onbeforeunload = null;
      if (isMobile) {
        window.onpagehide = null;
        document.onvisibilitychange = null;
      }

      // Stop the LocalVideoTrack.
      localVideoTrack.stop();

      // Handle the disconnected LocalParticipant.
      participantDisconnected(room.localParticipant, room);

      // Handle the disconnected RemoteParticipants.
      room.participants.forEach(participant => {
        participantDisconnected(participant, room);
      });

      // Clear the active Participant's video.
      $activeVideo.get(0).srcObject = null;

      // Clear the Room reference used for debugging from the JavaScript console.
      window.room = null;

      if (error) {
        // Reject the Promise with the TwilioError so that the Room selection
        // modal (plus the TwilioError message) can be displayed.
        reject(error);
      } else {
        // Resolve the Promise so that the Room selection modal can be
        // displayed.
        resolve();
      }
    });
  });


}

/*-------------------- Local Media Control --------------------------*/

muteAudioBtn.onclick = () => {
  const mute = !muteAudioBtn.classList.contains('muted');
  const activeIcon = document.getElementById('activeIcon');
  const inactiveIcon = document.getElementById('inactiveIcon');
  const myImg = document.getElementById('audioimg');
  
  if(mute) {
    muteYourAudio(room);
    muteAudioBtn.classList.add('muted');
    myImg.src = "images/mute.png";
    activeIcon.id = 'inactiveIcon';
    inactiveIcon.id = 'activeIcon';

  } else {
    unmuteYourAudio(room);
    muteAudioBtn.classList.remove('muted');
    myImg.src = "images/unmute.png";
    activeIcon.id = 'inactiveIcon';
   inactiveIcon.id = 'activeIcon';
  }
}


muteVideoBtn.onclick = () => {
  const mute = !muteVideoBtn.classList.contains('muted');
  const myImg2 = document.getElementById('vidoimg');
  


  if(mute) {
    muteYourVideo(room);
    if (videoProcessor) {
      localVideoTrack.removeProcessor(videoProcessor);
    }
    myImg2.src = "images/mutevideo.png";
    muteVideoBtn.classList.add('muted');
    
  } else {
    unmuteYourVideo(room);
  
    if(videoProcessor)
      localVideoTrack.addProcessor(videoProcessor);
    
    myImg2.src = "images/unmutevideo.png";
    muteVideoBtn.classList.remove('muted');
    
  }
}
/*-------------------- End Local Media Control --------------------------*/

/*-------------------- Start Snapshot --------------------------*/

let videoTrack;
let el;

// Show image or canvas
window.onload = function() {
  el = window.ImageCapture ? img : canvas;
  el.classList.remove('hidden');
  if(videoTrack) {
    setSnapshotSizeToVideo(el, videoTrack);
  }
}

closePopupButton.addEventListener('click', () => {
  popupContainer.style.display = 'none';
});

// Set the canvas size to the video size.
function setSnapshotSizeToVideo(snapshot, video) {
  snapshot.width = video.dimensions.width;
  snapshot.height = video.dimensions.height;
}



// Request the default LocalVideoTrack and display it.
displayLocalVideo(video).then(function(localVideoTrack) {
  // Display a snapshot of the LocalVideoTrack on the canvas.
  videoTrack = localVideoTrack;
 
  
  takeSnapshot.onclick = function() {
    popupContainer.style.display = 'block';
    setSnapshotSizeToVideo(el, localVideoTrack);
    takeLocalVideoSnapshot(video, localVideoTrack, el);
  };
});

// Resize the canvas to the video size whenever window is resized.
window.onresize = function() {
  setSnapshotSizeToVideo(el, videoTrack);
};
/*-------------------- End Snapshot --------------------------*/



/*-------------------- Start Screenshare --------------------------*/

  // Hide the "Stop Capture Screen" button.
  stopScreenCapture.style.display = 'none';

  // The LocalVideoTrack for your screen.
  let screenTrack;

  captureScreen.onclick = async function() {
    try {
      // Create and preview your local screen.
      screenTrack = await createScreenTrack(720, 1280);
      screenTrack.attach(screenPreview);
      muteVideoBtn.disabled=true;
      // Publish screen track to room
      await room.localParticipant.publishTrack(screenTrack);
     await room.localParticipant.unpublishTrack(localVideoTrack);
     
     
      // Show the "Stop Capture Screen" button.
      toggleButtons();
      // When screen sharing is stopped, unpublish the screen track.
      screenTrack.on('stopped', () => {
        muteVideoBtn.disabled=false;
        if (room) {
          toggleButtons();
          room.localParticipant.unpublishTrack(screenTrack); 
          if (videoProcessor) {
            localVideoTrack.removeProcessor(videoProcessor);
            localVideoTrack.addProcessor(videoProcessor);
          }
          
          room.localParticipant.publishTrack(localVideoTrack); 
          
          
          
        }
       // toggleButtons();
      });

      
    } catch (e) {
      alert(e.message);
    }
  };

  // Stop capturing your screen.
  const stopScreenSharing = () => 
  {
    screenTrack.stop();
    
    
  }


  stopScreenCapture.onclick = stopScreenSharing;

  // Remote Participant handles screen share track
  if(room.participants) {
     room.participants.on('trackPublished', publication => {
      onTrackPublished('publish', publication);
    });

    room.participants.on('trackUnpublished', publication => {
      onTrackPublished('unpublish', publication);
      
    });
  }

  // Disconnect from the Room on page unload.
  window.onbeforeunload = function() {
    if (room) {
      room.disconnect();
      room = null;
    }
    
  };


function toggleButtons() {
  captureScreen.style.display = captureScreen.style.display === 'none' ? '' : 'none';
  stopScreenCapture.style.display = stopScreenCapture.style.display === 'none' ? '' : 'none';
}

function onTrackPublished(publishType, publication, view) {
  if (publishType === 'publish') {
    if (publication.track) {
      publication.track.attach(view);
    }

    publication.on('subscribed', track => {
      track.attach(view);
    });
  } else if (publishType === 'unpublish') {
    if (publication.track) {
      publication.track.detach(view);
      view.srcObject = null;
    }

    publication.on('subscribed', track => {
      track.detach(view);
      view.srcObject = null;
    });
  }
}

/*-------------------- End Screenshare --------------------------*/



module.exports = joinRoom;

