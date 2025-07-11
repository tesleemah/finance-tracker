import { Request, Response } from "express";
import Budget from "../models/Budget";
import BudgetItem from "../models/BudgetItems";
import { sendBudgetCreationEmail } from "../utils/mail";

export const getBudget = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;

    const budgets = await Budget.find({ user: userId }).lean();

    if (!budgets || budgets.length === 0) {
      return res.status(404).json({
        message: "This user hasn't created any budget.",
      });
    }

    const budgetIds = budgets.map(b => b._id);

    // Fetch all related budget items
    const budgetItems = await BudgetItem.find({ budgetID: { $in: budgetIds } }).lean();

    // Attach items to each budget
    const budgetsWithItems = budgets.map(budget => {
      const items = budgetItems.filter(item => item.budgetID.toString() === budget._id.toString());
      return {
        ...budget,
        items,
      };
    });

    return res.status(200).json({ budgets: budgetsWithItems });

  } catch (error: any) {
    console.error(error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


export const updateBudget = async (req: Request, res: Response) => {
  try {
    const budget = await Budget.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },  
      req.body,
      { new: true, runValidators: true }
    );

    if (!budget) {
      return res.status(404).json({ message: "Budget not found or you're not authorized." });
    }

    return res.status(200).json({
      message: "Budget updated successfully.",
      budget,
    });
  } catch (error: any) {
    console.error(error.message);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const deleteBudget = async (req: Request, res: Response) => {
  try {
    const budget = await Budget.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,  // use _id consistently
    });

    if (!budget) {
      return res.status(404).json({
        error: "Budget not found or you're not authorized to delete this.",
      });
    }

    // Delete related budget items with the correct budget._id
    await BudgetItem.deleteMany({ budgetID: budget.value?._id });

    return res.status(200).json({
      message: "Budget and related items deleted successfully!",
      budget,  // Optionally return deleted budget info
    });
  } catch (error: any) {
    console.error(error.message);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const createBudget = async (req: Request, res: Response) => {
  try {
    const { title, items }: { title: string; items: { amount: number; name: string }[] } = req.body;

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

    const budget = await Budget.create({
      title,
      totalAmount,
      user: req.user._id,
    });

    for (const item of items) {
      await BudgetItem.create({
        user: req.user._id,
        category: req.body.categoryId,
        name: item.name,
        amount: item.amount,
        budgetID: budget._id,
      });
    }

    // Send email after budget creation
    await sendBudgetCreationEmail(req.user.email, title, totalAmount, items);

    res.status(201).json({
      message: "Budget created successfully and email sent!",
      budget,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
