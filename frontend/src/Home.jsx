import React from 'react'
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward';
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import NightsStayIcon from '@mui/icons-material/NightsStay';

function Home() {
  return (
    <div className="flex flex-col lg:px-4 bg-[url('./assets/PeriVue_Background.webp')] bg-cover bg-center bg-no-repeat ">
      <div className=' h-[90vh] flex overflow-hidden text-black'>
        <div className="flex flex-col  md:flex md:flex-row w-full h-full outline ">
          {/* -reverse if need */}
          <div className=" md:flex-5 p-4 font-semibold  text-white ">
            <p className='text-6xl lg:text-8xl'>Welcome,</p>
            <p className='text-6xl lg:text-8xl'> Dr. Villegas!</p>
            {/* <div className="hidden md:flex bg-outline shadow-2xl  rounded-3xl h-fit w-fit p-2 mt-5 gap-2">
              <div className="p-2 bg-lavender aspect-square h-[90px] rounded-2xl text-outline">
                <div className='flex w-full  gap-1 text-xs items-center '>
                  <NightsStayIcon fontSize="inherit" sx={{color:'#2D4066'}} />
                  <span className='font-semibold '>Night</span>
                </div>
                <div className="h-full  flex flex-col text-3xl">
                  <p className='font-semibold'>23</p>
                  <p className='text-sm font-normal'>PH</p>
                </div>
              </div>
              <div className=" flex  outline-outline items-end outline rounded-2xl p-2 bg-lavender h-fit text-white">
                <span className=''>22:00</span>
              </div>
            </div> */}
          </div>
          <div className="grid grid-cols-3 md:grid-cols-1 gap-2.5 p-4">
            {/* take note */}
            {[1, 2, 3,4].map((_, i) => (
              <div
                key={i}
                className="shadow-lg aspect-square md:h-[200x] md:w-[180px] lg:w-[200px] md:aspect-auto  flex flex-col p-3 rounded-2xl hover:scale-[1.02] transition-transform duration-200 cursor-pointer bg-lavender text-white"
              >
                <div className="flex justify-between items-start">
                  <span className="text-xs md:text-lg leading-tight">
                    Patients <br /> Screened
                  </span>

                  <div className="outline w-4 h-4 md:w-6 md:h-6 rounded-full flex items-center justify-center outline-outline bg-white/50">
                    <ArrowOutwardIcon fontSize="inherit" sx={{color:'#2D4066'}} />
                  </div>
                </div>

                <div className="flex-1" />

                <p className="text-5xl md:text-6xl font-semibold text-white">98</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* bottom navbar */}
      <div className="h-[10vh] flex items-center justify-center">
        <div className=" w-fit px-8 py-0.5 rounded-full shadow-md  bg-lavender flex items-center justify-center space-x-8 text-5xl  ">  
            {/* informations */}
            <button
              onClick={() => {}}
              className=" flex items-center justify-center text-4xl md:text-5xl text-black active:scale-[0.95] transition-transform duration-200 cursor-pointer "
            >
              <PersonIcon fontSize="inherit" sx={{color:'#2D4066'}} />
            </button>
            {/* dashboard */}
            <button
              onClick={() => {}}
              className=" flex items-center justify-center text-4xl md:text-5xl text-black active:scale-[0.95] transition-transform duration-200 cursor-pointer"
            >
              <SpaceDashboardIcon fontSize="inherit" sx={{color:'#2D4066'}} />
            </button>
            {/* test */}
            <button
              onClick={() => {}}
              className="hidden md:flex items-center justify-center text-4xl md:text-5xl text-black active:scale-[0.95] transition-transform duration-200 cursor-pointer "
            >
              <AddIcon fontSize="inherit" sx={{color:'#2D4066'}} />
            </button>
        </div>
      </div>
    </div>
  )
}

export default Home