// Flag and promise to track initialization status
let initPromise = null;
let isInitialized = false;

const doFBInit = () => {
  if (!window.FB) return false;
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID;

  if (!appId) {
    console.error("❌ ERROR: VITE_FACEBOOK_APP_ID no está definido en el archivo .env");
    return false;
  }

  console.log("Iniciando FB con AppID:", appId.substring(0, 4) + "...");

  window.FB.init({
    appId: appId,
    cookie: true,
    xfbml: true,
    version: 'v18.0'
  });
  isInitialized = true;
  console.log("✅ Facebook SDK Initialized manually/via script load");
  return true;
};

export const initFacebookSDK = () => {
  // If already initialized, return a resolved promise
  if (isInitialized) return Promise.resolve();
  // If initialization is in progress, return the existing promise
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    // 1. If FB object is already available (script loaded earlier)
    if (window.FB) {
      doFBInit();
      resolve();
      return;
    }

    // 2. Prepare callback for when the script finishes loading
    window.fbAsyncInit = function () {
      doFBInit();
      resolve();
    };

    // 3. Load SDK script if not already in the document
    (function (d, s, id) {
      var js, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) {
        // Script is there but FB is not yet ready or init not called
        // fbAsyncInit should eventually fire or we can poll for FB
        return;
      }
      js = d.createElement(s); js.id = id;
      js.src = "https://connect.facebook.net/es_ES/sdk.js";
      fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'facebook-jssdk'));
  });

  return initPromise;
};

export const loginWithFacebook = async (scopes = []) => {
  // CRITICAL: Ensure SDK is initialized before calling FB.login
  await initFacebookSDK();

  return new Promise((resolve, reject) => {
    if (!window.FB) {
      return reject(new Error('Facebook SDK no está cargado.'));
    }

    try {
      window.FB.login((response) => {
        if (response.authResponse) {
          resolve(response.authResponse);
        } else {
          reject(new Error('El usuario canceló el inicio de sesión o no autorizó la aplicación.'));
        }
      }, { scope: scopes.join(',') });
    } catch (err) {
      console.error("Error in FB.login:", err);
      reject(err);
    }
  });
};
