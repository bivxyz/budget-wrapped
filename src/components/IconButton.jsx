const paths={
  save:<><path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
  reset:<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
  replay:<><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8"/><path d="M4 4v4h4"/><path d="m10 9 5 3-5 3z"/></>,
  download:<><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
  upload:<><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 21h14"/></>,
  plus:<><path d="M12 5v14M5 12h14"/></>,
  trash:<><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></>,
  up:<><path d="m6 15 6-6 6 6"/></>,
  down:<><path d="m6 9 6 6 6-6"/></>
}

export function Icon({name,size=19}){return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>}
export function Spinner(){return <span className="icon-spinner" aria-hidden="true"/>}
export default function IconButton({label,icon,tone='secondary',busy=false,className='',...props}){
  return <button type="button" aria-label={label} title={label} className={`icon-button icon-button-${tone} ${className}`} {...props}>{busy?<Spinner/>:<Icon name={icon}/>}</button>
}
