import React from 'react'
import CustomInput from '../../components/CustomInput'

function Login() {
  return (
    <div className="flex items-center justify-center flex-col">
      <div className='container min-h-screen flex flex-col items-center justify-center space-y-2'>
        <CustomInput/>
        <CustomInput/>
      </div>
    </div>
  )
}

export default Login