import React from 'react'

function Home() {
  return (
    <div className='outline h-screen  bg-white flex'>
      <div className="outline w-48 h-full outline-black flex flex-col items-center p-2 space-y-2">
        <div className="outline w-full h-[150px] outline-black ">
          img
        </div>
        <div className="outline    white flex flex-1 w-full space-y-1 flex-col">
          <button className="btn shadow-none outline-none boder-none flex items-center justify-center rounded-lg w-full text-black">
            ji
          </button>
          <button className="btn shadow-none outline-none boder-none flex items-center justify-center rounded-lg w-full text-black">
            ji
          </button>
          <button className="btn shadow-none outline-none boder-none flex items-center justify-center rounded-lg w-full text-black">
            ji
          </button>
          <button className="btn shadow-none outline-none boder-none flex items-center justify-center rounded-lg w-full text-black">
            ji
          </button>
        </div>
        <div className="outline h-[120px] w-full flex flex-col justify-end">
        <button className="btn shadow-none  outline-none boder-none flex items-center justify-center rounded-lg w-full text-black">
            logout
          </button>
        </div>
      </div>
    </div>
  )
}

export default Home