import React from 'react'

function CustomInput() {
  return (
    <label className="input outline bg-white outline-gray-300 border-none">
        <input type="text" className={'grow bg-white text-black focus:outline-none focus:border-none min-w-1/4 '} placeholder="Email Address" />
    </label>
  )
}

export default CustomInput