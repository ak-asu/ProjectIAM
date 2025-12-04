import { useState, useEffect } from 'react';
import { QRCode, ErrorPopup } from '@/app/components';
import { Typography, Button, Box, Paper, Alert, TextField } from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import { createVerificationRequest, checkVerificationStatus } from '@/services/verification';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';

const VerifyPage = () => {
  const [qrCodeData, setQrCodeData] = useState<any>(null);
  const [sessionID, setSessionID] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    status: string;
    did: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [degree, setDegree] = useState('');

  const startVerification = async () => {
    setIsLoading(true);
    setError(null);
    setVerificationResult(null);
    setQrCodeData(null);

    try {
      // Public URLs (wallet must reach them)
      const issuerUrl = process.env.NEXT_PUBLIC_ISSUER_URL || 'http://localhost:8080';
      const schemaUrl =
        process.env.NEXT_PUBLIC_DEGREE_SCHEMA_URL || `${issuerUrl}/schemas/degree-credential-schema.json`;

      // Build query based on user input
      const query: any = {};
      if (studentName) {
        query.name = { $eq: studentName }; // Match exact name
      }
      if (degree) {
        query.degree = { $eq: degree }; // Match exact degree
      }

      // Build disclose array - only request fields that are being queried or are essential
      // Essential fields: name and degree (what we want to verify)
      // Optional fields: university and graduationYear (only if needed)
      const disclose: string[] = ['name', 'degree'];

      // If no specific query, request basic credential info
      if (Object.keys(query).length === 0) {
        // For general verification, also show university
        disclose.push('university');
      }

      // Create verification request for DegreeCredential
      const verificationRequest = {
        credentialType: 'DegreeCredential',
        schemaUrl: schemaUrl, // JSON schema URL; context is injected by backend config
        query: query,
        disclose: disclose,
      };

      const { sessionId, data } = await createVerificationRequest(verificationRequest);
      setQrCodeData(data);
      setSessionID(sessionId);
      setIsLoading(false);
    } catch (error) {
      setError(`Failed to create verification request: ${error}`);
      setIsLoading(false);
    }
  };

  // Poll for verification status
  useEffect(() => {
    if (!sessionID) {
      return;
    }

    let interval: NodeJS.Timeout;
    const checkStatus = async () => {
      try {
        const response = await checkVerificationStatus(sessionID);
        if (response && response.status === 'verified') {
          clearInterval(interval);
          setVerificationResult(response);
          setQrCodeData(null); // Hide QR code after successful verification
        }
      } catch (error) {
        setError(`Failed to check verification status: ${error}`);
        clearInterval(interval);
      }
    };

    interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [sessionID]);

  return (
    <Grid
      container
      spacing={0}
      direction="column"
      alignItems="center"
      justifyContent="center"
      sx={{ minHeight: '100vh', padding: 4 }}
    >
      {error && <ErrorPopup error={error} />}

      <Grid xs={12} style={{ marginTop: '-30px', marginBottom: '30px' }}>
        <Typography textAlign="center" variant="h2">
          Verify Degree Credential
        </Typography>
        <Typography textAlign="center" variant="body1" sx={{ mt: 2, color: 'text.secondary' }}>
          Verify a student&apos;s degree credential using zero-knowledge proofs
        </Typography>
      </Grid>

      {/* Initial state - show form and start button */}
      {!qrCodeData && !verificationResult && (
        <Grid xs={12} container direction="column" alignItems="center" spacing={3}>
          <Grid xs={12} sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <Paper elevation={2} sx={{ p: 4, maxWidth: 500, width: '100%' }}>
              <Typography variant="h6" sx={{ mb: 3, textAlign: 'center' }}>
                Verification Criteria (Optional)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
                Specify criteria to verify specific student information. Leave blank to verify any degree credential.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Student Name"
                  placeholder="e.g., John Doe"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  fullWidth
                  helperText="Verify credential for a specific student name"
                />
                <TextField
                  label="Degree"
                  placeholder="e.g., Bachelor of Computer Science"
                  value={degree}
                  onChange={(e) => setDegree(e.target.value)}
                  fullWidth
                  helperText="Verify a specific degree type"
                />
              </Box>
            </Paper>
          </Grid>
          <Grid xs={12} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Button
              variant="contained"
              size="large"
              onClick={startVerification}
              disabled={isLoading}
              startIcon={<QrCodeScannerIcon />}
              sx={{ minWidth: 250, height: 60, fontSize: '1.1rem' }}
            >
              {isLoading ? 'Creating Request...' : 'Start Verification'}
            </Button>
            <Box sx={{ maxWidth: 500 }}>
              <Alert severity="info">
                Click the button to generate a verification QR code. The student will scan this code with their Polygon ID wallet to prove they have a valid degree credential.
              </Alert>
            </Box>
          </Grid>
        </Grid>
      )}

      {/* QR code display */}
      {qrCodeData && !verificationResult && (
        <>
          <Grid xs={12}>
            <Typography textAlign="center" variant="h5" sx={{ mb: 2 }}>
              Scan this QR code with Polygon ID wallet
            </Typography>
            <Typography textAlign="center" variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
              Waiting for proof submission...
            </Typography>
          </Grid>
          <Grid alignItems="center" xs={12}>
            <QRCode value={JSON.stringify(qrCodeData)} />
          </Grid>
        </>
      )}

      {/* Verification result */}
      {verificationResult && (
        <Grid xs={12}>
          <Paper
            elevation={3}
            sx={{
              p: 4,
              maxWidth: 600,
              textAlign: 'center',
              backgroundColor: 'success.light',
              color: 'success.contrastText',
            }}
          >
            <VerifiedUserIcon sx={{ fontSize: 80, mb: 2 }} />
            <Typography variant="h4" sx={{ mb: 2 }}>
              Credential Verified!
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              The degree credential has been successfully verified.
            </Typography>
            <Box sx={{ mt: 3, p: 2, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 1 }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
                Verified DID:
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {verificationResult.did}
              </Typography>
            </Box>
            <Button
              variant="contained"
              color="inherit"
              onClick={startVerification}
              sx={{ mt: 3 }}
            >
              Verify Another Credential
            </Button>
          </Paper>
        </Grid>
      )}
    </Grid>
  );
};

export default VerifyPage;
