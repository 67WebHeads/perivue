import React, { useEffect, useState } from 'react'
import SplashScreen from './components/SplashScreen';
import Home from './Home.jsx'
import Login from './pages/auth/login.jsx';

function App() {
  // declare sessions din dito
  const [loading, setLoading] = useState(true);
  const [fadeSplash, setFadeSplash] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setFadeSplash(true);
      setTimeout(() => {
        setLoading(false); 
      }, 800);
    }, 3000);
  }, []);

    // if (loading) {
    //   return <SplashScreen fading={fadeSplash} />;
    // }

  return (
    <div className="fade-in">
      <Home/>
      {/* <Login/> */}
    </div>
  )
  // return <Login/>
  // if (!user) return <Login />;
}

export default App