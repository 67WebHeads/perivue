import React from "react";
import GoogleIcon from "@mui/icons-material/Google";
import splash_art_perivue from "../../assets/splash_art_perivue.png";
import API_BASE_URL from "../../config/api";

function Login() {
  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/accounts/google/login/`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[url('./assets/PeriVue_Background.webp')] bg-cover bg-center bg-no-repeat">
      <div className="flex flex-col items-center justify-center space-y-6 p-10 rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl">
        <img
          src={splash_art_perivue}
          alt="Splash"
          className="w-[200px] h-[200px] object-contain"
        />
        <div className="flex flex-col items-center space-y-2">
          <h1 className="text-white text-2xl font-bold tracking-wide">Welcome to PeriVue</h1>
          <p className="text-white/60 text-sm">Sign in to continue</p>
        </div>
        <button
          onClick={handleGoogleLogin}
          className="flex items-center justify-center gap-2 p-4 w-[220px] rounded-full bg-white text-black font-medium hover:bg-gray-200 active:scale-95 transition-all"
        >
          <GoogleIcon fontSize="small"/>
          <span>Sign in with Google</span>
        </button>
      </div>
    </div>
  );
}

export default Login;