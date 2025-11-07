'use client'

import React, { useState, useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Grid, Box, Typography, Button, Backdrop, CircularProgress} from '@mui/material';
import JSONPretty from 'react-json-pretty';
import { requestIssueNewCredential } from '@/services/issuer'
import { CredentialDegreeRequest, CredentialRequest } from '@/services/issuer';
import { ErrorPopup } from '@/app/components';
import SelectedIssuerContext from '@/contexts/SelectedIssuerContext';

const App = () => {
  const router = useRouter();
  const routerQuery = router.query;


  const { selectedIssuerContext } = useContext(SelectedIssuerContext);
  useEffect(() => {
    if (!selectedIssuerContext) {
      router.push('/');
      return;
    }
  }, [selectedIssuerContext, router]);

  const [error, setError] = useState<string | null>(null);

  const [credentialRequest, setCredentialRequest] = useState<CredentialRequest>();

  // Automatically create degree credential request on mount
  useEffect(() => {
    if (routerQuery.userID && !credentialRequest) {
      const cr = new CredentialDegreeRequest(
        routerQuery.userID as string,
        "Demo User",
        "Bachelor of Computer Science",
        "Demo University",
        2024
      ).construct();
      setCredentialRequest(cr);
    }
  }, [routerQuery.userID, credentialRequest]);

  const [isLoaded, setIsLoaded] = useState(false);
  const newCredentialRequest = async () => {
      setIsLoaded(true);
      try {
        if (!credentialRequest) {
          throw new Error('Credential request is not set');
        }

        const credentialInfo = await requestIssueNewCredential(selectedIssuerContext, credentialRequest)
        router.push(`/offer?claimId=${credentialInfo.id}&issuer=${selectedIssuerContext}&subject=${routerQuery.userID as string}`);
      } catch (error) {
        setError(`Error making the request: ${error}`);
      } finally {
        setIsLoaded(false);
      }
  }

  return (
    <Grid container
      direction="column"
      justifyContent="center"
      alignItems="center"
      height="100%"
    >
    {error && <ErrorPopup error={error} />}

    {credentialRequest && (
      <Grid container direction="column" alignItems="center" textAlign="center" spacing={3}>
        <Grid>
          <Typography variant="h4" textAlign="center">
            Degree Certificate Credential
          </Typography>
          <Typography variant="body1" textAlign="center" color="text.secondary" sx={{ mt: 1 }}>
            For user: {routerQuery.userID}
          </Typography>
        </Grid>
        <Grid textAlign="left">
          <Typography variant="h6" textAlign="left" sx={{ mb: 2 }}>
            Credential Details:
          </Typography>
          <Box alignItems="left">
            <JSONPretty
            id="json-pretty"
            style={{
              fontSize: "1.1em",
            }}
            data={JSON.stringify(credentialRequest)}
            theme={jsonStyle}
          ></JSONPretty>
          </Box>
        </Grid>
        <Grid>
          <Button onClick={newCredentialRequest} variant="contained" size="large" sx={{ mt: 2 }}>
            Issue Degree Credential
          </Button>
        </Grid>
      </Grid>
    )}

    <Backdrop
      sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
      open={isLoaded}
    >
      <CircularProgress color="inherit" />
    </Backdrop>
  </Grid>
  );
};

const jsonStyle = {
  main: 'line-height:1.3;color:#66d9ef;background:#272822;overflow:auto;',
  error: 'line-height:1.3;color:#66d9ef;background:#272822;overflow:auto;',
  key: 'color:#f92672;',
  string: 'color:#fd971f;',
  value: 'color:#a6e22e;',
  boolean: 'color:#ac81fe;',
}

export default App;
