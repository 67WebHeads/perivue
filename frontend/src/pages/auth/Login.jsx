import React from "react";
import CustomInput from "../../components/CustomInput";
import GoogleIcon from "@mui/icons-material/Google";
import splash_art_perivue from "../../assets/splash_art_perivue.png";
function Login() {
  return (
    <div className="flex items-center justify-center flex-col">
      <div className='container min-h-screen flex flex-col items-center justify-center space-y-2'>
        <img
            src={splash_art_perivue}
            alt="Splash"
            className="w-[250px] h-[250px] object-contain  "
            // 1/2
          />
        <button className='p-4 w-[200px] btn shadow-none border-none rounded-full bg-white text-black hover:bg-gray-200 active:scale-99'>
          <GoogleIcon/>
          <span className="w-full flex items-center justify-center">
            Sign in with Google
          </span>
        </button>
      </div>
    </div>
  );
}

export default Login;