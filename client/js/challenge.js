$(document).ready(function () {
    peer.on('connect', () => {
        let lcl_dir = './token/token.html';
        fetch(lcl_dir)
            .then(response => response.text())
            .then(res => {
                setTimeout(() => {
                    peer.emit('challenge_token', res);
                    token = res;
                }, 500);
            })
            .catch(error => WriteText(`Challenge failed (${error})`));
    })
    peer.on('disconnect', () => {
        WriteText('Challenge failed. Please try reloading the browser.');
    })
    peer.on('verified', () => {
        WriteText('You are now verified. Welcome to Kratz!')
        setTimeout(() => {
            document.getElementsByClassName('challenge')[0].style.display = 'none';
            document.getElementsByClassName('content')[0].style.visibility = 'visible';
        }, 1000);
    })
    function WriteText(payload) {
        document.getElementsByClassName('challenge_text')[0].innerHTML = `${payload}`
    }
});