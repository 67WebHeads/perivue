import React, { useEffect, useState } from "react";
import SplashScreen from "./components/SplashScreen";
import { useNavigate } from "react-router-dom";

function App() {
  const [fadeSplash, setFadeSplash] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setTimeout(() => {
      setFadeSplash(true);
      setTimeout(() => {
        navigate('/login');
      }, 800);
    }, 3000);
  }, []);

  return (
    <div className="fade-in">
      <SplashScreen fading={fadeSplash} />
    </div>
  );
}

export default App;
