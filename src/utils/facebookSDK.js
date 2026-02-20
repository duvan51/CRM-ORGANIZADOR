export const initFacebookSDK = () => {
  return new Promise((resolve) => {
    window.fbAsyncInit = function() {
      window.FB.init({
        appId      : import.meta.env.VITE_FACEBOOK_APP_ID,
        cookie     : true,
        xfbml      : true,
        version    : 'v18.0'
      });
      resolve();
    };

    (function(d, s, id) {
      var js, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s); js.id = id;
      js.src = "https://connect.facebook.net/es_ES/sdk.js";
      fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'facebook-jssdk'));
  });
};

export const loginWithFacebook = (scopes = []) => {
  return new Promise((resolve, reject) => {
    window.FB.login((response) => {
      if (response.authResponse) {
        resolve(response.authResponse);
      } else {
        reject(new Error('El usuario canceló el inicio de sesión o no autorizó la aplicación.'));
      }
    }, { scope: scopes.join(',') });
  });
};
