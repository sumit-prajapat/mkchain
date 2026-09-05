"""
Data Retention Cleanup Service
Enforces data retention limits based on subscription plan tier
"""
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
import logging

from models import WalletAnalysis, Transaction, GraphNode, GraphEdge, AnalysisArchive
from models_billing import Subscription, RetentionCleanupLog, PLAN_LIMITS
from models_organization import Organization

logger = logging.getLogger(__name__)


class DataRetentionCleanupService:
    """Service to enforce data retention limits based on subscription plan tier"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_retention_period_days(self, plan_tier: str) -> int:
        """
        Get retention period in days for a plan tier.
        
        Args:
            plan_tier: Plan tier (free, pro, enterprise)
            
        Returns:
            Number of days to retain data
        """
        return PLAN_LIMITS.get(plan_tier, PLAN_LIMITS["free"])["retention_days"]
    
    async def cleanup_expired_data(self, org_id: str = None) -> Dict[str, int]:
        """
        Clean up expired analysis data for one or all organizations.
        
        Args:
            org_id: Optional organization UUID. If None, process all organizations.
            
        Returns:
            Dictionary with cleanup statistics
        """
        logger.info(f"Starting data retention cleanup{' for org ' + str(org_id) if org_id else ' for all orgs'}")
        
        total_stats = {
            "organizations_processed": 0,
            "total_analyses_deleted": 0,
            "total_transactions_deleted": 0,
            "total_graph_nodes_deleted": 0,
            "total_graph_edges_deleted": 0,
        }
        
        # Get organizations to process
        query = self.db.query(Organization)
        if org_id:
            query = query.filter(Organization.id == org_id)
        
        organizations = query.all()
        
        for org in organizations:
            try:
                stats = await self._cleanup_organization_data(org)
                total_stats["organizations_processed"] += 1
                total_stats["total_analyses_deleted"] += stats["analyses_deleted"]
                total_stats["total_transactions_deleted"] += stats["transactions_deleted"]
                total_stats["total_graph_nodes_deleted"] += stats["graph_nodes_deleted"]
                total_stats["total_graph_edges_deleted"] += stats["graph_edges_deleted"]
                
            except Exception as e:
                logger.error(f"Error cleaning up data for org {org.id}: {str(e)}", exc_info=True)
                continue
        
        logger.info(f"Cleanup completed: {total_stats}")
        return total_stats
    
    async def _cleanup_organization_data(self, org: Organization) -> Dict[str, int]:
        """
        Clean up expired data for a single organization.
        
        Args:
            org: Organization instance
            
        Returns:
            Dictionary with cleanup statistics for this org
        """
        # Get organization's subscription and retention period
        subscription = self.db.query(Subscription).filter(
            Subscription.org_id == org.id
        ).first()
        
        if not subscription:
            # No subscription, use free tier defaults
            plan_tier = "free"
            logger.info(f"Org {org.id} has no subscription, using free tier retention")
        else:
            plan_tier = subscription.plan_tier
        
        retention_days = self.get_retention_period_days(plan_tier)
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
        
        logger.info(
            f"Processing org {org.id} (plan: {plan_tier}, retention: {retention_days} days, "
            f"cutoff: {cutoff_date})"
        )
        
        # Find analyses older than retention period
        expired_analyses = self.db.query(WalletAnalysis).filter(
            and_(
                WalletAnalysis.org_id == org.id,
                WalletAnalysis.created_at < cutoff_date
            )
        ).all()
        
        if not expired_analyses:
            logger.info(f"No expired analyses found for org {org.id}")
            return {
                "analyses_deleted": 0,
                "transactions_deleted": 0,
                "graph_nodes_deleted": 0,
                "graph_edges_deleted": 0,
                "data_deleted_gb": Decimal("0.00")
            }
        
        analysis_ids = [analysis.id for analysis in expired_analyses]
        logger.info(f"Found {len(analysis_ids)} expired analyses for org {org.id}")
        
        # Count related data before deletion
        transactions_count = self.db.query(func.count(Transaction.id)).filter(
            Transaction.analysis_id.in_(analysis_ids)
        ).scalar() or 0
        
        graph_nodes_count = self.db.query(func.count(GraphNode.id)).filter(
            GraphNode.analysis_id.in_(analysis_ids)
        ).scalar() or 0
        
        graph_edges_count = self.db.query(func.count(GraphEdge.id)).filter(
            GraphEdge.analysis_id.in_(analysis_ids)
        ).scalar() or 0
        
        # Estimate data size (rough approximation)
        # Average sizes: analysis ~5KB, transaction ~1KB, node ~500B, edge ~500B
        estimated_size_kb = (
            len(analysis_ids) * 5 +
            transactions_count * 1 +
            graph_nodes_count * 0.5 +
            graph_edges_count * 0.5
        )
        data_deleted_gb = Decimal(str(round(estimated_size_kb / 1024 / 1024, 2)))
        
        # Delete related data (cascade will handle this, but being explicit for logging)
        # The relationships in WalletAnalysis have cascade="all, delete" so deletion
        # of the analysis will cascade to transactions, nodes, and edges
        
        logger.info(
            f"Deleting {len(analysis_ids)} analyses and related data for org {org.id}: "
            f"{transactions_count} transactions, {graph_nodes_count} nodes, "
            f"{graph_edges_count} edges (~{data_deleted_gb} GB)"
        )
        
        # Archive analysis metadata before deletion (Requirement 12.5)
        logger.info(f"Archiving metadata for {len(expired_analyses)} analyses")
        for analysis in expired_analyses:
            archive = AnalysisArchive(
                original_id=analysis.id,
                org_id=analysis.org_id,
                user_id=analysis.user_id,
                address=analysis.address,
                chain=analysis.chain,
                risk_score=analysis.risk_score,
                risk_label=analysis.risk_label,
                created_at=analysis.created_at,
                archived_at=datetime.utcnow(),
                deletion_reason="retention_policy"
            )
            self.db.add(archive)
        
        # Flush archives before deletion to ensure they're saved
        self.db.flush()
        
        # Delete the analyses (cascade will delete related data)
        for analysis in expired_analyses:
            self.db.delete(analysis)
        
        # Create cleanup log entry
        cleanup_log = RetentionCleanupLog(
            org_id=org.id,
            analyses_deleted=len(analysis_ids),
            data_deleted_gb=data_deleted_gb,
            cleanup_date=datetime.utcnow()
        )
        self.db.add(cleanup_log)
        
        # Commit the deletions and log
        self.db.commit()
        
        logger.info(
            f"Successfully cleaned up data for org {org.id}: "
            f"{len(analysis_ids)} analyses deleted"
        )
        
        return {
            "analyses_deleted": len(analysis_ids),
            "transactions_deleted": transactions_count,
            "graph_nodes_deleted": graph_nodes_count,
            "graph_edges_deleted": graph_edges_count,
            "data_deleted_gb": data_deleted_gb
        }
    
    async def get_cleanup_history(
        self, 
        org_id: str = None,
        days: int = 30
    ) -> List[RetentionCleanupLog]:
        """
        Get cleanup history for an organization or all organizations.
        
        Args:
            org_id: Optional organization UUID. If None, get all cleanup logs.
            days: Number of days of history to retrieve (default 30)
            
        Returns:
            List of RetentionCleanupLog entries
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        query = self.db.query(RetentionCleanupLog).filter(
            RetentionCleanupLog.cleanup_date >= cutoff_date
        )
        
        if org_id:
            query = query.filter(RetentionCleanupLog.org_id == org_id)
        
        return query.order_by(RetentionCleanupLog.cleanup_date.desc()).all()
    
    async def get_retention_stats(self, org_id: str) -> Dict[str, any]:
        """
        Get retention statistics for an organization.
        
        Args:
            org_id: Organization UUID
            
        Returns:
            Dictionary with retention stats including:
            - plan_tier
            - retention_days
            - total_analyses
            - analyses_within_retention
            - analyses_to_be_deleted
            - oldest_analysis_date
            - next_cleanup_date
        """
        # Get subscription
        subscription = self.db.query(Subscription).filter(
            Subscription.org_id == org_id
        ).first()
        
        plan_tier = subscription.plan_tier if subscription else "free"
        retention_days = self.get_retention_period_days(plan_tier)
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
        
        # Count analyses
        total_analyses = self.db.query(func.count(WalletAnalysis.id)).filter(
            WalletAnalysis.org_id == org_id
        ).scalar() or 0
        
        analyses_within_retention = self.db.query(func.count(WalletAnalysis.id)).filter(
            and_(
                WalletAnalysis.org_id == org_id,
                WalletAnalysis.created_at >= cutoff_date
            )
        ).scalar() or 0
        
        analyses_to_be_deleted = total_analyses - analyses_within_retention
        
        # Get oldest analysis date
        oldest_analysis = self.db.query(WalletAnalysis).filter(
            WalletAnalysis.org_id == org_id
        ).order_by(WalletAnalysis.created_at.asc()).first()
        
        oldest_analysis_date = oldest_analysis.created_at if oldest_analysis else None
        
        # Next cleanup would be tomorrow (assuming daily schedule)
        next_cleanup_date = datetime.utcnow().replace(
            hour=0, minute=0, second=0, microsecond=0
        ) + timedelta(days=1)
        
        return {
            "plan_tier": plan_tier,
            "retention_days": retention_days,
            "retention_cutoff_date": cutoff_date,
            "total_analyses": total_analyses,
            "analyses_within_retention": analyses_within_retention,
            "analyses_to_be_deleted": analyses_to_be_deleted,
            "oldest_analysis_date": oldest_analysis_date,
            "next_cleanup_date": next_cleanup_date
        }
    
    async def preview_cleanup(self, org_id: str) -> Dict[str, any]:
        """
        Preview what would be deleted in next cleanup without actually deleting.
        
        Args:
            org_id: Organization UUID
            
        Returns:
            Dictionary with preview data including analysis IDs that would be deleted
        """
        subscription = self.db.query(Subscription).filter(
            Subscription.org_id == org_id
        ).first()
        
        plan_tier = subscription.plan_tier if subscription else "free"
        retention_days = self.get_retention_period_days(plan_tier)
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
        
        # Find analyses that would be deleted
        expired_analyses = self.db.query(WalletAnalysis).filter(
            and_(
                WalletAnalysis.org_id == org_id,
                WalletAnalysis.created_at < cutoff_date
            )
        ).all()
        
        if not expired_analyses:
            return {
                "would_delete": False,
                "analyses_count": 0,
                "analyses": []
            }
        
        analysis_ids = [analysis.id for analysis in expired_analyses]
        
        # Count related data
        transactions_count = self.db.query(func.count(Transaction.id)).filter(
            Transaction.analysis_id.in_(analysis_ids)
        ).scalar() or 0
        
        graph_nodes_count = self.db.query(func.count(GraphNode.id)).filter(
            GraphNode.analysis_id.in_(analysis_ids)
        ).scalar() or 0
        
        graph_edges_count = self.db.query(func.count(GraphEdge.id)).filter(
            GraphEdge.analysis_id.in_(analysis_ids)
        ).scalar() or 0
        
        return {
            "would_delete": True,
            "plan_tier": plan_tier,
            "retention_days": retention_days,
            "cutoff_date": cutoff_date,
            "analyses_count": len(analysis_ids),
            "transactions_count": transactions_count,
            "graph_nodes_count": graph_nodes_count,
            "graph_edges_count": graph_edges_count,
            "analyses": [
                {
                    "id": analysis.id,
                    "address": analysis.address,
                    "created_at": analysis.created_at,
                    "risk_score": analysis.risk_score
                }
                for analysis in expired_analyses
            ]
        }


# Scheduled job function for daily cleanup
async def run_daily_cleanup(db: Session) -> Dict[str, int]:
    """
    Run daily data retention cleanup for all organizations.
    
    This function should be called by a scheduler (e.g., APScheduler, Celery)
    to run once per day.
    
    Args:
        db: Database session
        
    Returns:
        Dictionary with cleanup statistics
    """
    logger.info("Starting scheduled daily data retention cleanup")
    service = DataRetentionCleanupService(db)
    
    try:
        stats = await service.cleanup_expired_data()
        logger.info(f"Daily cleanup completed successfully: {stats}")
        return stats
    except Exception as e:
        logger.error(f"Daily cleanup failed: {str(e)}", exc_info=True)
        raise
