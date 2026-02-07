import React from 'react'

function CustomInput({className, placeholder,inputClass,type}) {
  return (
    <label className={`input outline bg-white outline-gray-300 border-none ${className}`}>
        <input type={`${type}`} className={`grow bg-white text-black focus:outline-none focus:border-none min-w-1/4 ${inputClass}`} placeholder={`${placeholder}`} />
    </label>
  )
}

export default CustomInput