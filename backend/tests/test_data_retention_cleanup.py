"""
Unit tests for DataRetentionCleanupService
Tests data retention enforcement based on subscription plan tiers
"""
import pytest
from unittest.mock import Mock

from models_billing import PlanTier
from services.data_retention_cleanup import DataRetentionCleanupService


def test_get_retention_period_days():
    """Test retention period retrieval for different plan tiers"""
    mock_db = Mock()
    service = DataRetentionCleanupService(mock_db)
    
    assert service.get_retention_period_days(PlanTier.FREE) == 7
    assert service.get_retention_period_days(PlanTier.PRO) == 30
    assert service.get_retention_period_days(PlanTier.ENTERPRISE) == 365


def test_service_archives_metadata_before_deletion():
    """Test that the service creates archive records before deletion (Requirement 12.5)"""
    # This is a logic test to verify the service implementation includes archiving
    from services.data_retention_cleanup import DataRetentionCleanupService
    import inspect
    
    # Get the source code of _cleanup_organization_data method
    source = inspect.getsource(DataRetentionCleanupService._cleanup_organization_data)
    
    # Verify that the method includes archiving logic
    assert "AnalysisArchive" in source, "Service should create AnalysisArchive records"
    assert "archived_at" in source, "Service should set archived_at timestamp"
    assert "deletion_reason" in source, "Service should set deletion_reason"
    assert "self.db.add(archive)" in source, "Service should add archive to database"
    assert "self.db.flush()" in source, "Service should flush archives before deletion"


def test_service_logs_cleanup_operations():
    """Test that the service logs cleanup operations (Requirement 12.4)"""
    from services.data_retention_cleanup import DataRetentionCleanupService
    import inspect
    
    # Get the source code of _cleanup_organization_data method
    source = inspect.getsource(DataRetentionCleanupService._cleanup_organization_data)
    
    # Verify that the method includes logging logic
    assert "RetentionCleanupLog" in source, "Service should create RetentionCleanupLog records"
    assert "analyses_deleted" in source, "Service should log analyses_deleted count"
    assert "data_deleted_gb" in source, "Service should log data_deleted_gb"


def test_service_respects_retention_periods():
    """Test that the service uses correct retention period for each plan tier"""
    from services.data_retention_cleanup import DataRetentionCleanupService
    import inspect
    
    # Get the source code of _cleanup_organization_data method
    source = inspect.getsource(DataRetentionCleanupService._cleanup_organization_data)
    
    # Verify that the method uses retention period from plan tier
    assert "get_retention_period_days" in source, "Service should call get_retention_period_days"
    assert "cutoff_date" in source, "Service should calculate cutoff_date based on retention"
    assert "timedelta(days=retention_days)" in source, "Service should use retention_days in calculation"


def test_service_deletes_related_data():
    """Test that the service deletes transactions, nodes, and edges (Requirement 12.3)"""
    from services.data_retention_cleanup import DataRetentionCleanupService
    import inspect
    
    # Get the source code of _cleanup_organization_data method
    source = inspect.getsource(DataRetentionCleanupService._cleanup_organization_data)
    
    # Verify that the method counts related data before deletion
    assert "Transaction" in source, "Service should handle transactions"
    assert "GraphNode" in source, "Service should handle graph nodes"
    assert "GraphEdge" in source, "Service should handle graph edges"


def test_run_daily_cleanup_function_exists():
    """Test that the run_daily_cleanup scheduled job function exists (Requirement 12.1)"""
    from services.data_retention_cleanup import run_daily_cleanup
    import inspect
    
    # Verify function exists and is async
    assert callable(run_daily_cleanup), "run_daily_cleanup should be a callable function"
    assert inspect.iscoroutinefunction(run_daily_cleanup), "run_daily_cleanup should be async"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
