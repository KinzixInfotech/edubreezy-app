import { useState, useEffect, useRef } from 'react';
import { View, Modal, StyleSheet, ActivityIndicator, Text, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { X } from 'lucide-react-native';
import HapticTouchable from './HapticTouch';

/**
 * PaymentWebView - Modal component for online payment gateway
 * 
 * Opens a WebView for bank payment page, handles redirect detection,
 * and polls for payment status completion.
 */
export default function PaymentWebView({
    visible,
    paymentData, // { redirectUrl, params, method, orderId }
    onClose,
    onPaymentComplete, // (status: 'SUCCESS' | 'FAILED' | 'CANCELLED') => void
    apiBaseUrl,
}) {
    const [loading, setLoading] = useState(true);
    const [htmlContent, setHtmlContent] = useState('');
    const pollingRef = useRef(null);
    const webViewRef = useRef(null);

    // Generate HTML form to auto-submit to payment gateway or Load Razorpay
    useEffect(() => {
        if (!paymentData) return;

        // Handle Razorpay
        if (paymentData.type === 'RAZORPAY') {
            const { keyId, order, prefill, theme } = paymentData;
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body>
                    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
                    <script>
                    var options = {
                        "key": "${keyId}",
                        "amount": "${order.amount}",
                        "currency": "${order.currency}",
                        "name": "EduBreezy",
                        "description": "Fee Payment",
                        "order_id": "${order.id}",
                        "handler": function (response){
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'RAZORPAY_RESULT',
                                status: 'SUCCESS',
                                data: response
                            }));
                        },
                        "prefill": {
                            "name": "${prefill?.name || ''}",
                            "email": "${prefill?.email || ''}",
                            "contact": "${prefill?.contact || ''}"
                        },
                        "theme": {
                            "color": "${theme?.color || '#0469ff'}"
                        },
                        "modal": {
                            "ondismiss": function(){
                                window.ReactNativeWebView.postMessage(JSON.stringify({
                                    type: 'RAZORPAY_RESULT',
                                    status: 'CANCELLED'
                                }));
                            }
                        }
                    };
                    var rzp1 = new Razorpay(options);
                    rzp1.on('payment.failed', function (response){
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'RAZORPAY_RESULT',
                            status: 'FAILED',
                            data: response.error
                        }));
                    });
                    rzp1.open();
                    </script>
                </body>
                </html>
            `;
            setHtmlContent(html);
            return;
        }

        if (!paymentData?.redirectUrl) return;

        const { redirectUrl, params, method = 'POST' } = paymentData;

        // Create auto-submitting form
        const formInputs = params
            ? Object.entries(params)
                .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}" />`)
                .join('\n')
            : '';

        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            font-family: system-ui; 
            background: #f5f5f5;
          }
          .loading { text-align: center; color: #666; }
        </style>
      </head>
      <body>
        <div class="loading">
          <p>Redirecting to secure payment...</p>
        </div>
        <form id="paymentForm" method="${method}" action="${redirectUrl}">
          ${formInputs}
        </form>
        <script>
          document.getElementById('paymentForm').submit();
        </script>
      </body>
      </html>
    `;

        setHtmlContent(html);
    }, [paymentData]);

    // Handle messages from WebView (Razorpay)
    const handleMessage = (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'RAZORPAY_RESULT') {
                if (data.status === 'SUCCESS') {
                    // We need to verify this signature on backend
                    onPaymentComplete?.('SUCCESS', data.data);
                } else if (data.status === 'FAILED') {
                    onPaymentComplete?.('FAILED', data.data);
                } else {
                    onClose?.();
                }
            }
        } catch (e) {
            console.error("WebView Message Error", e);
        }
    };

    // Start polling for payment status (only for non-Razorpay or standard redirect)
    useEffect(() => {
        if (!visible || !paymentData?.orderId || paymentData.type === 'RAZORPAY') return;

        const pollStatus = async () => {
            try {
                const res = await fetch(`${apiBaseUrl}/payment/status/${paymentData.orderId}`);
                const data = await res.json();

                if (data.status === 'SUCCESS') {
                    clearInterval(pollingRef.current);
                    onPaymentComplete?.('SUCCESS');
                } else if (data.status === 'FAILED') {
                    clearInterval(pollingRef.current);
                    onPaymentComplete?.('FAILED');
                }
                // Keep polling if PENDING
            } catch (error) {
                console.error('Payment status poll error:', error);
            }
        };

        // Poll every 3 seconds
        pollingRef.current = setInterval(pollStatus, 3000);

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [visible, paymentData?.orderId, paymentData?.type]);

    const handleClose = () => {
        if (pollingRef.current) clearInterval(pollingRef.current);

        Alert.alert(
            'Cancel Payment?',
            'Are you sure you want to cancel this payment?',
            [
                { text: 'Continue Payment', style: 'cancel' },
                {
                    text: 'Cancel',
                    style: 'destructive',
                    onPress: () => {
                        onPaymentComplete?.('CANCELLED');
                        onClose?.();
                    }
                },
            ]
        );
    };

    // Detect callback URLs in WebView navigation
    const handleNavigationChange = (navState) => {
        const url = navState.url || '';

        // Detect success/failure callback URLs
        if (url.includes('/payment/callback') || url.includes('payment-status')) {
            // The callback API will update the payment status
            // Polling will pick it up
        }
    };

    if (!visible || !paymentData) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={handleClose}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <HapticTouchable onPress={handleClose}>
                        <View style={styles.closeButton}>
                            <X size={24} color="#111" />
                        </View>
                    </HapticTouchable>
                    <Text style={styles.headerTitle}>Secure Payment</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* WebView */}
                <View style={styles.webViewContainer}>
                    {loading && (
                        <View style={styles.loadingOverlay}>
                            <ActivityIndicator size="large" color="#0469ff" />
                            <Text style={styles.loadingText}>Loading payment gateway...</Text>
                        </View>
                    )}

                    <WebView
                        ref={webViewRef}
                        source={{ html: htmlContent }}
                        style={styles.webView}
                        onLoadEnd={() => setLoading(false)}
                        onNavigationStateChange={handleNavigationChange}
                        onMessage={handleMessage}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                        startInLoadingState={true}
                        scalesPageToFit={true}
                        originWhitelist={['*']}
                    />
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <View style={styles.securityBadge}>
                        <Text style={styles.securityText}>🔒 Secure 256-bit encrypted</Text>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    webViewContainer: {
        flex: 1,
        position: 'relative',
    },
    webView: {
        flex: 1,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#666',
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
        backgroundColor: '#fafafa',
    },
    securityBadge: {
        alignItems: 'center',
    },
    securityText: {
        fontSize: 12,
        color: '#666',
    },
});
