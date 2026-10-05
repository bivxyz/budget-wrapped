const paths={
  save:<><path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
  reset:<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
  replay:<><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8"/><path d="M4 4v4h4"/><path d="m10 9 5 3-5 3z"/></>,
  download:<><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
  upload:<><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 21h14"/></>,
  plus:<><path d="M12 5v14M5 12h14"/></>,
  trash:<><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></>,
  up:<><path d="m6 15 6-6 6 6"/></>,
  down:<><path d="m6 9 6 6 6-6"/></>,
  home:<><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M9 21v-7h6v7"/></>,
  transactions:<><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  weekly:<><path d="M4 6h16v14H4z"/><path d="M8 3v6M16 3v6M4 10h16"/></>,
  trends:<><path d="M4 19V5M4 19h16"/><path d="m7 15 4-5 3 3 5-7"/></>,
  message:<><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></>,
  receipt:<><path d="M5 3v18l3-2 4 2 4-2 3 2V3l-3 2-4-2-4 2z"/><path d="M8 9h8M8 13h6"/></>,
  more:<><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>
}

export function Icon({name,size=19}){return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>}
export function Spinner(){return <span className="icon-spinner" aria-hidden="true"/>}
export default function IconButton({label,icon,tone='secondary',busy=false,className='',...props}){
  return <button type="button" aria-label={label} title={label} className={`icon-button icon-button-${tone} ${className}`} {...props}>{busy?<Spinner/>:<Icon name={icon}/>}</button>
}
