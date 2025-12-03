import React, { useEffect, useState, useContext } from 'react';
import { Selecter, ErrorPopup } from '@/app/components';
import { getIssuersList } from '@/services/issuer';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Unstable_Grid2';
import { Typography, Divider, Box } from '@mui/material';
import SelectedIssuerContext from '@/contexts/SelectedIssuerContext';
import { useRouter } from 'next/router';

const App = () => {
    const router = useRouter();

    const onClick = () => {
        router.push('/signin');
    }

    const onVerifyClick = () => {
        router.push('/verify');
    }

    const [issuerList, setIssuerList] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const { setSelectedIssuerContext } = useContext(SelectedIssuerContext);

    const handleSelectIssuer = (selectedIssuer: string) => {
        setSelectedIssuerContext(selectedIssuer);
    };

    useEffect(() => {
        const fetchIssuers = async () => {
            try {
                const issuers = await getIssuersList();
                setIssuerList(issuers);
            } catch (error) {
                setError(`Failed to fetch issuers ${error}`);
            }
        };

        fetchIssuers();
    }, []);

    return (
        <Grid
            container
            spacing={0}
            direction="column"
            alignItems="center"
            justifyContent="center"
            sx={{ minHeight: '100vh', padding: 4 }}
        >
            <Grid xs={12} sx={{ mb: 4 }}>
                <Typography variant="h3" textAlign="center" sx={{ mb: 2 }}>
                    Privado ID Degree Certificate System
                </Typography>
                <Typography variant="body1" textAlign="center" color="text.secondary">
                    Issue and verify degree credentials using zero-knowledge proofs
                </Typography>
            </Grid>

            <Box sx={{ maxWidth: 600, width: '100%' }}>
                {/* Issue Credential Section */}
                <Box sx={{ mb: 4, p: 3, border: '1px solid #e0e0e0', borderRadius: 2 }}>
                    <Typography variant="h5" sx={{ mb: 2 }}>
                        Issue Degree Credential
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Authenticate with your DID and receive a verifiable degree credential
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid xs={12}>
                            {error ? (
                                <ErrorPopup error={error} />
                            ) : (
                                <Selecter datalist={issuerList} label='Select issuer' callback={handleSelectIssuer} />
                            )}
                        </Grid>
                        <Grid xs={12}>
                            <Button
                                variant="contained"
                                fullWidth
                                size="large"
                                onClick={onClick}
                                sx={{ height: 50 }}
                            >
                                Sign In to Receive Credential
                            </Button>
                        </Grid>
                    </Grid>
                </Box>

                <Divider sx={{ my: 3 }} />

                {/* Verify Credential Section */}
                <Box sx={{ p: 3, border: '1px solid #e0e0e0', borderRadius: 2 }}>
                    <Typography variant="h5" sx={{ mb: 2 }}>
                        Verify Degree Credential
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Verify a student&apos;s degree credential using zero-knowledge proofs
                    </Typography>
                    <Button
                        variant="outlined"
                        fullWidth
                        size="large"
                        onClick={onVerifyClick}
                        sx={{ height: 50 }}
                    >
                        Start Verification
                    </Button>
                </Box>
            </Box>
        </Grid>
    );
};

export default App;
