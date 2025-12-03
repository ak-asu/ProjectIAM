import React, { useState } from 'react';
import SelectedIssuerContext from '@/contexts/SelectedIssuerContext';


const SelectedIssuerProvider = ({ children }: { children: React.ReactNode }) => {
    const [selectedIssuerContext, setSelectedIssuerContext] = useState('');

    return (
        <SelectedIssuerContext.Provider value={{selectedIssuerContext, setSelectedIssuerContext}}>
            {children}
        </SelectedIssuerContext.Provider>
    );
};

export default SelectedIssuerProvider;