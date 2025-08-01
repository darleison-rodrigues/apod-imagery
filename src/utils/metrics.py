import pynvml
from pynvml import *

def get_comprehensive_gpu_metrics(device_index=0):
    """
    Get comprehensive GPU metrics using NVML
    """
    try:
        nvmlInit()
        handle = nvmlDeviceGetHandleByIndex(device_index)
        
        # Basic info
        gpu_name = nvmlDeviceGetName(handle)
        driver_version = nvmlSystemGetDriverVersion()
        
        # Utilization
        utilization = nvmlDeviceGetUtilizationRates(handle)
        
        # Memory
        memory = nvmlDeviceGetMemoryInfo(handle)
        
        # Temperature
        try:
            temperature = nvmlDeviceGetTemperature(handle, NVML_TEMPERATURE_GPU)
        except:
            temperature = None
            
        # Power
        try:
            power_draw = nvmlDeviceGetPowerUsage(handle) / 1000.0  # Convert to watts
            power_limit = nvmlDeviceGetPowerManagementLimitConstraints(handle)
            power_limit_current = power_limit[1] / 1000.0  # Convert to watts
        except:
            power_draw = None
            power_limit_current = None
            
        # Clock speeds
        try:
            graphics_clock = nvmlDeviceGetClockInfo(handle, NVML_CLOCK_GRAPHICS)
            memory_clock = nvmlDeviceGetClockInfo(handle, NVML_CLOCK_MEM)
            sm_clock = nvmlDeviceGetClockInfo(handle, NVML_CLOCK_SM)
        except:
            graphics_clock = memory_clock = sm_clock = None
            
        # Fan speed
        try:
            fan_speed = nvmlDeviceGetFanSpeed(handle)
        except:
            fan_speed = None
            
        # Performance state
        try:
            perf_state = nvmlDeviceGetPerformanceState(handle)
        except:
            perf_state = None
            
        # Process information
        try:
            compute_processes = nvmlDeviceGetComputeRunningProcesses(handle)
            graphics_processes = nvmlDeviceGetGraphicsRunningProcesses(handle)
            total_processes = len(compute_processes) + len(graphics_processes)
        except:
            total_processes = None
            
        # Video encoder/decoder utilization
        try:
            encoder_util = nvmlDeviceGetEncoderUtilization(handle)
            decoder_util = nvmlDeviceGetDecoderUtilization(handle)
        except:
            encoder_util = decoder_util = None
            
        # ECC errors (if supported)
        try:
            ecc_single_bit = nvmlDeviceGetTotalEccErrors(handle, NVML_SINGLE_BIT_ECC, NVML_VOLATILE_ECC)
            ecc_double_bit = nvmlDeviceGetTotalEccErrors(handle, NVML_DOUBLE_BIT_ECC, NVML_VOLATILE_ECC)
        except:
            ecc_single_bit = ecc_double_bit = None
            
        nvmlShutdown()
        
        return {
            # Basic Information
            'gpu_name': gpu_name,
            'driver_version': driver_version,
            
            # Utilization
            'gpu_utilization': utilization.gpu,
            'memory_utilization': utilization.memory,
            
            # Memory
            'memory_used': memory.used,
            'memory_total': memory.total,
            'memory_free': memory.free,
            'memory_used_percent': (memory.used / memory.total) * 100,
            
            # Temperature
            'temperature': temperature,
            
            # Power
            'power_draw': power_draw,
            'power_limit': power_limit_current,
            'power_usage_percent': (power_draw / power_limit_current * 100) if power_draw and power_limit_current else None,
            
            # Clock Speeds
            'graphics_clock': graphics_clock,
            'memory_clock': memory_clock,
            'sm_clock': sm_clock,
            
            # Cooling
            'fan_speed': fan_speed,
            
            # Performance
            'performance_state': perf_state,
            
            # Processes
            'running_processes': total_processes,
            
            # Video Processing
            'encoder_utilization': encoder_util[0] if encoder_util else None,
            'decoder_utilization': decoder_util[0] if decoder_util else None,
            
            # ECC Errors
            'ecc_single_bit_errors': ecc_single_bit,
            'ecc_double_bit_errors': ecc_double_bit,
        }
        
    except Exception as e:
        print(f"Error getting GPU metrics: {e}")
        return None

# Example usage
if __name__ == "__main__":
    metrics = get_comprehensive_gpu_metrics()
    if metrics:
        print("GPU Metrics:")
        for key, value in metrics.items():
            if value is not None:
                print(f"  {key}: {value}")

def calculate_top_n_accuracy(predictions, ground_truth, n=1):
    """
    Calculates Top-N accuracy.
    :param predictions: List of lists, where each inner list contains predicted labels sorted by confidence.
    :param ground_truth: List of true labels.
    :param n: The 'N' for Top-N accuracy.
    :return: Top-N accuracy score.
    """
    if len(predictions) != len(ground_truth):
        raise ValueError("Predictions and ground truth lists must have the same length.")

    correct_predictions = 0
    for i in range(len(predictions)):
        if ground_truth[i] in predictions[i][:n]:
            correct_predictions += 1
    return correct_predictions / len(predictions)

def calculate_mrr(predictions, ground_truth):
    """
    Calculates Mean Reciprocal Rank (MRR).
    :param predictions: List of lists, where each inner list contains predicted labels sorted by confidence.
    :param ground_truth: List of true labels.
    :return: MRR score.
    """
    if len(predictions) != len(ground_truth):
        raise ValueError("Predictions and ground truth lists must have the same length.")

    reciprocal_ranks = []
    for i in range(len(predictions)):
        try:
            rank = predictions[i].index(ground_truth[i]) + 1
            reciprocal_ranks.append(1 / rank)
        except ValueError:  # True label not found in predictions
            reciprocal_ranks.append(0)
    return sum(reciprocal_ranks) / len(reciprocal_ranks)

def calculate_precision_at_k(predictions, ground_truth, k=1):
    """
    Calculates Precision@k.
    :param predictions: List of lists, where each inner list contains predicted labels sorted by confidence.
    :param ground_truth: List of true labels.
    :param k: The 'k' for Precision@k.
    :return: Precision@k score.
    """
    if len(predictions) != len(ground_truth):
        raise ValueError("Predictions and ground truth lists must have the same length.")

    precision_scores = []
    for i in range(len(predictions)):
        relevant_in_top_k = 0
        for j in range(min(k, len(predictions[i]))):
            if predictions[i][j] == ground_truth[i]:
                relevant_in_top_k = 1  # Only one true label, so it's either 1 or 0
                break
        precision_scores.append(relevant_in_top_k)
    return sum(precision_scores) / len(precision_scores)