import React from 'react'
import splash_art_perivue from '../assets/splash_art_perivue.webp'
function SplashScreen({fading}) {
  return (
    <div className={`flex flex-col text-white items-center justify-center min-h-screen bg-zinc-800 fixed  ${fading ? "fade-out" : ""}`}>
        <img
            src={splash_art_perivue}
            alt="Splash"
            className="w-full h-full object-cover"
        />
        <span className='text-sm md:text-sm'>Manual • Central • Peripheral </span>
    </div>
  )
}

export default SplashScreen;