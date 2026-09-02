import { useEffect,useRef,useState } from 'react'
import { createPortal } from 'react-dom'

export default function SelectMenu({value,onChange,options,label,className='',disabled=false}){
  const [open,setOpen]=useState(false),[position,setPosition]=useState(null),buttonRef=useRef(null),menuRef=useRef(null)
  const normalized=options.map(option=>typeof option==='string'?{value:option,label:option}:option)
  const selected=normalized.find(option=>option.value===value)
  const toggle=()=>{if(disabled)return;if(!open){const rect=buttonRef.current.getBoundingClientRect(),height=Math.min(280,normalized.length*38+12),openUp=window.innerHeight-rect.bottom<height&&rect.top>height;setPosition({left:Math.min(rect.left,window.innerWidth-Math.max(rect.width,220)-8),top:openUp?rect.top-height-4:rect.bottom+4,width:Math.max(rect.width,220),maxHeight:height})}setOpen(v=>!v)}
  useEffect(()=>{if(!open)return;const outside=event=>{if(!buttonRef.current?.contains(event.target)&&!menuRef.current?.contains(event.target))setOpen(false)},close=()=>setOpen(false);document.addEventListener('mousedown',outside);window.addEventListener('resize',close);return()=>{document.removeEventListener('mousedown',outside);window.removeEventListener('resize',close)}},[open])
  return <><button ref={buttonRef} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={toggle} disabled={disabled} className={`select-menu-button ${className}`}><span className="truncate">{selected?.label||label||value}</span><span className={`select-chevron ${open?'rotate-180':''}`}>⌄</span></button>{open&&position&&createPortal(<div ref={menuRef} role="listbox" aria-label={label} className="select-menu-popover" style={{left:position.left,top:position.top,width:position.width,maxHeight:position.maxHeight}}>{normalized.map(option=><button key={option.value} type="button" role="option" aria-selected={option.value===value} className="select-menu-option" onClick={()=>{onChange(option.value);setOpen(false)}}>{option.label}</button>)}</div>,document.body)}</>
}
