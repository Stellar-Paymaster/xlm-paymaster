import React from "react";
// We use type-only imports or require to avoid breaking non-RN environments if possible,
// but for a dedicated RN module, standard imports are expected.
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
  ViewStyle,
  TextStyle,
} from "react-native";
import { useGaslessTransaction } from "../hooks/useGaslessTransaction";
import { FeeBumpResponse } from "../../FluidClient";

export interface SponsorButtonProps {
  /**
   * The transaction to sponsor (XDR or object with toXDR)
   */
  transaction: string | { toXDR: () => string };
  /**
   * Callback to sign the transaction. 
   * This is where you'd use your local keys or a wallet connector.
   */
  onSign: (xdr: string) => Promise<string>;
  /**
   * Whether to automatically submit
   * @default true
   */
  submit?: boolean;
  /**
   * Callback on success
   */
  onSuccess?: (response: FeeBumpResponse) => void;
  /**
   * Callback on error
   */
  onError?: (error: Error) => void;
  /**
   * Custom labels for different states
   */
  labels?: {
    idle?: string;
    signing?: string;
    sponsoring?: string;
    success?: string;
    error?: string;
  };
  /**
   * Custom styles
   */
  style?: ViewStyle;
  /**
   * Custom text styles
   */
  textStyle?: TextStyle;
  /**
   * Whether the button is disabled
   */
  disabled?: boolean;
}

/**
 * A premium React Native button component for gasless transactions.
 */
export const SponsorButton: React.FC<SponsorButtonProps> = ({
  transaction,
  onSign,
  submit = true,
  onSuccess,
  onError,
  labels = {},
  style,
  textStyle,
  disabled = false,
}) => {
  const { execute, status, isLoading, error } = useGaslessTransaction({
    submit,
    onSuccess,
    onError,
  });

  const getLabel = () => {
    switch (status) {
      case "signing":
        return labels.signing || "Signing...";
      case "sponsoring":
        return labels.sponsoring || "Sponsoring...";
      case "success":
        return labels.success || "Success!";
      case "error":
        return labels.error || "Failed";
      default:
        return labels.idle || "Sponsor & Submit";
    }
  };

  const handlePress = () => {
    if (isLoading || disabled) return;
    execute(transaction, onSign);
  };

  const getBackgroundColor = () => {
    if (disabled) return "#D1D5DB";
    switch (status) {
      case "success":
        return "#10B981";
      case "error":
        return "#EF4444";
      default:
        return "#0EA5E9";
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={isLoading || disabled}
      style={[
        styles.button,
        { backgroundColor: getBackgroundColor() },
        style,
      ]}
    >
      <View style={styles.content}>
        {isLoading && (
          <ActivityIndicator color="#FFFFFF" style={styles.loader} />
        )}
        <Text style={[styles.text, textStyle]}>{getLabel()}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  loader: {
    marginRight: 10,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
