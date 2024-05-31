'use strict';

function showSnackBar(message){
    var x = document.getElementById("snackbar");
    x.innerHTML = message;
    x.className = "show";
    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
}

exports.showSnackBar = showSnackBar;