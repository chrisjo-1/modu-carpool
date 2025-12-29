
import React, { useState, useEffect } from 'react';
import { REGION_DATA, Region } from '../types';

interface RegionSelectorProps {
  onSelect: (region: Region) => void;
  className?: string;
  placeholderPrefix?: string;
  initialValue?: Region | null;
}

const RegionSelector: React.FC<RegionSelectorProps> = ({ onSelect, className, placeholderPrefix = "", initialValue }) => {
  const [city, setCity] = useState(initialValue?.city || '');
  const [district, setDistrict] = useState(initialValue?.district || '');
  const [neighborhood, setNeighborhood] = useState(initialValue?.neighborhood || '');

  const cities = Object.keys(REGION_DATA);
  const districts = city ? Object.keys(REGION_DATA[city]) : [];
  const neighborhoods = (city && district) ? REGION_DATA[city][district] : [];

  useEffect(() => {
    if (city && district && neighborhood) {
      onSelect({ city, district, neighborhood });
    }
  }, [city, district, neighborhood, onSelect]);

  const selectClass = "p-2.5 border border-sky-200 rounded-xl focus:ring-2 focus:ring-sky-400 focus:border-transparent outline-none bg-sky-50 text-sm transition-all hover:bg-sky-100/50 cursor-pointer";

  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      <select 
        className={selectClass}
        value={city}
        onChange={(e) => { setCity(e.target.value); setDistrict(''); setNeighborhood(''); }}
      >
        <option value="">{placeholderPrefix}시/도</option>
        {cities.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      <select 
        className={selectClass}
        value={district}
        onChange={(e) => { setDistrict(e.target.value); setNeighborhood(''); }}
        disabled={!city}
      >
        <option value="">구/군</option>
        {districts.map(d => <option key={d} value={d}>{d}</option>)}
      </select>

      <select 
        className={selectClass}
        value={neighborhood}
        onChange={(e) => setNeighborhood(e.target.value)}
        disabled={!district}
      >
        <option value="">동/읍/면</option>
        {neighborhoods.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
};

export default RegionSelector;
